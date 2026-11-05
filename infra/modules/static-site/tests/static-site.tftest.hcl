mock_provider "aws" {
  mock_data "aws_cloudfront_cache_policy" {
    defaults = {
      id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn = "arn:aws:cloudfront::000000000000:distribution/EDFDVBD6EXAMPLE"
    }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = {
      arn = "arn:aws:cloudfront::000000000000:function/allfit-test-site-request"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::000000000000:role/allfit-test-site-deploy"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::allfit-test-site"
    }
  }
}

variables {
  name              = "allfit-test-site"
  host              = "www.example.test"
  certificate_arn   = "arn:aws:acm:us-east-1:000000000000:certificate/abc"
  oidc_provider_arn = "arn:aws:iam::000000000000:oidc-provider/token.actions.githubusercontent.com"
  github_repository = "allfitone@1/site@2"
  redirects = {
    "/"          = { location = "/es", status = 302 }
    "/privacy/x" = { location = "/es/privacy/x", status = 301 }
  }
}

run "the_bucket_is_never_public" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket_public_access_block.this.block_public_acls
      && aws_s3_bucket_public_access_block.this.block_public_policy
      && aws_s3_bucket_public_access_block.this.ignore_public_acls
      && aws_s3_bucket_public_access_block.this.restrict_public_buckets
    )
    error_message = "Visitors reach the files through CloudFront only."
  }
}

run "only_this_distribution_reads_the_bucket" {
  command = apply

  assert {
    condition = (
      jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Principal.Service == "cloudfront.amazonaws.com"
      && jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Action == "s3:GetObject"
      && jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Condition.StringEquals["AWS:SourceArn"] == aws_cloudfront_distribution.this.arn
    )
    error_message = "The bucket policy grants reads to this distribution and nothing else."
  }
}

run "serves_the_host_over_https_with_the_shared_certificate" {
  command = plan

  assert {
    condition     = aws_cloudfront_distribution.this.aliases == toset(["www.example.test"])
    error_message = "The distribution answers for its one host."
  }

  assert {
    condition     = aws_cloudfront_distribution.this.viewer_certificate[0].acm_certificate_arn == var.certificate_arn
    error_message = "TLS uses the shared ACM certificate."
  }

  assert {
    condition     = aws_cloudfront_distribution.this.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "Plain HTTP is redirected."
  }
}

run "redirects_and_clean_urls_run_at_the_edge" {
  command = plan

  assert {
    condition = (
      strcontains(aws_cloudfront_function.request.code, "\"/privacy/x\"")
      && strcontains(aws_cloudfront_function.request.code, "\"/es/privacy/x\"")
      && strcontains(aws_cloudfront_function.request.code, ".html")
    )
    error_message = "The function carries the redirects and maps clean paths to their exported files."
  }
}

run "a_missing_page_answers_404_with_the_site_page" {
  command = plan

  assert {
    condition = alltrue([
      for e in aws_cloudfront_distribution.this.custom_error_response :
      e.response_code == 404 && e.response_page_path == "/404.html"
    ]) && length(aws_cloudfront_distribution.this.custom_error_response) == 2
    error_message = "S3 answers 403 for a missing key; both 403 and 404 become the site's 404 page."
  }
}

run "only_main_of_the_site_repository_deploys" {
  command = plan

  assert {
    condition = (
      jsondecode(aws_iam_role.deploy.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]
      == "repo:allfitone@1/site@2:environment:Production"
    )
    error_message = "The trust names one repository and its Production environment."
  }
}

run "the_deploy_role_writes_its_bucket_and_invalidates_its_distribution_only" {
  command = apply

  assert {
    condition = toset(flatten([
      for s in jsondecode(aws_iam_role_policy.deploy.policy).Statement : s.Resource
      ])) == toset([
      "arn:aws:s3:::allfit-test-site",
      "arn:aws:s3:::allfit-test-site/*",
      "arn:aws:cloudfront::000000000000:distribution/EDFDVBD6EXAMPLE",
    ])
    error_message = "No wildcard: one bucket, its objects and one distribution."
  }
}
