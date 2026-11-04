mock_provider "aws" {}

variables {
  name         = "allfitone"
  repositories = ["api", "worker", "studio-web", "backoffice-web", "space-web", "migrator"]
}

run "one_repository_per_image" {
  command = plan

  assert {
    condition     = toset(keys(aws_ecr_repository.this)) == toset(var.repositories)
    error_message = "Every image needs exactly one repository."
  }

  assert {
    condition     = aws_ecr_repository.this["api"].name == "allfitone/api"
    error_message = "Repositories live under the project prefix."
  }
}

run "a_tag_always_names_the_same_image" {
  command = plan

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "Tags must be immutable, so a deployed SHA cannot be overwritten."
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.this : r.image_scanning_configuration[0].scan_on_push])
    error_message = "Every push must be scanned."
  }
}

run "keeps_only_the_last_ten_images" {
  command = plan

  assert {
    condition = alltrue([
      for p in aws_ecr_lifecycle_policy.this :
      jsondecode(p.policy).rules[0].selection.countNumber == 10
      && jsondecode(p.policy).rules[0].selection.countType == "imageCountMoreThan"
    ])
    error_message = "Each repository keeps its last ten images and expires the rest."
  }

  assert {
    condition     = length(aws_ecr_lifecycle_policy.this) == length(var.repositories)
    error_message = "Every repository needs the retention policy."
  }
}
