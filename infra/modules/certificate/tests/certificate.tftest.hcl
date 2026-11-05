mock_provider "aws" {}

variables {
  domain_names = ["api.allfit.one", "studio.allfit.one", "www.allfit.one"]
}

run "one_certificate_for_every_name" {
  command = plan

  assert {
    condition     = aws_acm_certificate.this.domain_name == "api.allfit.one"
    error_message = "The first name is the certificate's subject."
  }

  assert {
    condition     = toset(aws_acm_certificate.this.subject_alternative_names) == toset(["api.allfit.one", "studio.allfit.one", "www.allfit.one"])
    error_message = "Every name must be on the one certificate the load balancer and CloudFront share."
  }
}

run "validated_through_dns" {
  command = plan

  assert {
    condition     = aws_acm_certificate.this.validation_method == "DNS"
    error_message = "DNS validation renews on its own as long as the records stay in GoDaddy."
  }
}
