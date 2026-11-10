mock_provider "aws" {}

variables {
  name                       = "allfit-test"
  vpc_id                     = "vpc-0123456789abcdef0"
  subnet_ids                 = ["subnet-aaaa", "subnet-bbbb"]
  instance_security_group_id = "sg-0instances0000000"
  certificate_arn            = "arn:aws:acm:us-east-1:000000000000:certificate/test"
  origin_verify_secret       = "only-for-the-test"
  backoffice_origin          = "https://backoffice.allfit.one"
  apps = {
    api = {
      hosts        = ["api.allfit.one"]
      port         = 8080
      health_path  = "/health"
      behind_cdn   = false
      rule_ordinal = 10
    }
    studio-web = {
      hosts        = ["studio.allfit.one"]
      port         = 3000
      health_path  = "/"
      behind_cdn   = true
      rule_ordinal = 20
    }
    space-web = {
      hosts        = ["www.allfit.one", "space.allfit.one"]
      port         = 3000
      health_path  = "/es"
      behind_cdn   = true
      rule_ordinal = 40
    }
  }
}

run "no_request_waits_longer_than_the_default" {
  command = plan

  assert {
    condition     = aws_lb.this.idle_timeout == 60
    error_message = "No request may take long enough to need more than the default 60 s."
  }

  assert {
    condition     = aws_lb.this.drop_invalid_header_fields == true
    error_message = "Malformed headers must be dropped at the edge."
  }
}

run "https_only" {
  command = plan

  assert {
    condition     = aws_lb_listener.http.default_action[0].redirect[0].protocol == "HTTPS" && aws_lb_listener.http.default_action[0].redirect[0].status_code == "HTTP_301"
    error_message = "Port 80 only redirects to HTTPS."
  }

  assert {
    condition     = aws_lb_listener.https.ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06"
    error_message = "TLS 1.2 or newer only."
  }

  assert {
    condition     = aws_lb_listener.https.default_action[0].type == "fixed-response" && aws_lb_listener.https.default_action[0].fixed_response[0].status_code == "404"
    error_message = "A host nobody serves gets a 404, not some app."
  }
}

run "the_api_is_reached_directly_and_webs_only_through_cloudfront" {
  command = plan

  assert {
    condition     = length([for c in aws_lb_listener_rule.app["api"].condition : c if length(c.http_header) > 0]) == 0
    error_message = "The API is served straight from the load balancer, with no CloudFront header."
  }

  assert {
    condition = alltrue([
      for app in ["studio-web", "space-web"] :
      anytrue([for c in aws_lb_listener_rule.app[app].condition : length(c.http_header) > 0 && one(c.http_header).http_header_name == "X-Origin-Verify"])
    ])
    error_message = "A web answers only requests that came through its CloudFront distribution."
  }

  assert {
    condition     = toset(keys(aws_cloudfront_distribution.web)) == toset(["studio-web", "space-web"])
    error_message = "Only the webs get a distribution; the API never does."
  }
}

run "cloudfront_speaks_https_on_both_sides" {
  command = plan

  assert {
    condition = alltrue([
      for d in aws_cloudfront_distribution.web :
      d.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
      && one(d.origin).custom_origin_config[0].origin_protocol_policy == "https-only"
    ])
    error_message = "Viewer to CloudFront and CloudFront to the load balancer are both HTTPS."
  }

  assert {
    condition     = toset(aws_cloudfront_distribution.web["space-web"].aliases) == toset(["www.allfit.one", "space.allfit.one"])
    error_message = "A distribution answers for every host of its app."
  }
}

run "the_load_balancer_opens_only_web_ports" {
  command = plan

  assert {
    condition     = toset([for r in aws_vpc_security_group_ingress_rule.public : r.from_port]) == toset([80, 443])
    error_message = "Only 80 and 443 are open to the internet."
  }

  assert {
    condition     = aws_vpc_security_group_egress_rule.to_instances.referenced_security_group_id == "sg-0instances0000000"
    error_message = "The load balancer only talks to the ECS machines."
  }
}

run "drains_quickly" {
  command = plan

  assert {
    condition     = alltrue([for tg in aws_lb_target_group.app : tg.deregistration_delay == "30"])
    error_message = "No request lasts a second, so thirty seconds of draining is plenty."
  }
}

run "one_address_cannot_keep_guessing_sign_ins" {
  command = plan

  assert {
    condition     = aws_wafv2_web_acl.sign_in.scope == "REGIONAL" && length(aws_wafv2_web_acl.sign_in.default_action[0].allow) == 1
    error_message = "The limits sit on the load balancer and let everything else through."
  }

  assert {
    condition     = toset([for r in aws_wafv2_web_acl.sign_in.rule : r.name]) == toset(["backoffice-sign-in", "space-sign-in"])
    error_message = "Backoffice and Space sign-ins each have their own limit."
  }

  assert {
    condition = alltrue([
      for r in aws_wafv2_web_acl.sign_in.rule :
      r.statement[0].rate_based_statement[0].aggregate_key_type == "IP"
      && r.statement[0].rate_based_statement[0].evaluation_window_sec == 300
    ])
    error_message = "Each limit counts one address over five minutes."
  }

  assert {
    condition = {
      for r in aws_wafv2_web_acl.sign_in.rule : r.name => r.statement[0].rate_based_statement[0].limit
    } == { "backoffice-sign-in" = 20, "space-sign-in" = 100 }
    error_message = "Twenty Backoffice sign-in requests or a hundred Space ones per address, then a pause."
  }

  assert {
    condition = alltrue([
      for r in aws_wafv2_web_acl.sign_in.rule :
      r.action[0].block[0].custom_response[0].response_code == 429
      && r.action[0].block[0].custom_response[0].custom_response_body_key == "rate-limited"
    ])
    error_message = "A refused sign-in answers 429 rate-limited, as the API does."
  }

  assert {
    condition = anytrue([
      for r in aws_wafv2_web_acl.sign_in.rule :
      r.name == "backoffice-sign-in" && contains(
        [for h in r.action[0].block[0].custom_response[0].response_header : "${h.name}=${h.value}"],
        "Access-Control-Allow-Origin=https://backoffice.allfit.one"
      )
    ])
    error_message = "The Backoffice reads the refusal; without CORS it would see a network error."
  }
}

run "the_limits_guard_the_load_balancer" {
  command = plan

  # Known at plan, so the association can be compared with what it points at.
  override_resource {
    target          = aws_lb.this
    override_during = plan
    values = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:000000000000:loadbalancer/app/allfit-test/0123456789abcdef"
    }
  }

  override_resource {
    target          = aws_wafv2_web_acl.sign_in
    override_during = plan
    values = {
      arn = "arn:aws:wafv2:us-east-1:000000000000:regional/webacl/allfit-test-sign-in/00000000-0000-4000-8000-000000000000"
    }
  }

  assert {
    condition     = aws_wafv2_web_acl_association.load_balancer.resource_arn == aws_lb.this.arn
    error_message = "The limits apply where the API is reached."
  }

  assert {
    condition     = aws_wafv2_web_acl_association.load_balancer.web_acl_arn == aws_wafv2_web_acl.sign_in.arn
    error_message = "The load balancer uses the sign-in limits."
  }
}
