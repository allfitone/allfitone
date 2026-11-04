/**
 * The public entry: an Application Load Balancer for everything and CloudFront
 * in front of the web apps only.
 *
 * The load balancer ends TLS with the shared ACM certificate and sends each
 * request to the target group of its host; ECS registers every container in
 * its app's group on the port bridge mode gave it. The API is reached here
 * directly, with no CDN in between: an edge cache in front of it once answered
 * 304 without CORS headers and broke the browser apps.
 *
 * The webs go through CloudFront, which caches only Next's hashed static files.
 * CloudFront forwards the visitor's Host, so the load balancer's certificate and
 * host rules match, and adds a secret header that the web rules require: a
 * request sent straight to the load balancer for a web host gets a 404.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

locals {
  cdn_apps = { for key, app in var.apps : key => app if app.behind_cdn }
}

resource "aws_security_group" "load_balancer" {
  name        = "${var.name}-alb"
  description = "Public load balancer: HTTP and HTTPS in, ECS machines out"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "public" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.load_balancer.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
  description       = "Port ${each.key} from the internet"
}

resource "aws_vpc_security_group_egress_rule" "to_instances" {
  security_group_id            = aws_security_group.load_balancer.id
  referenced_security_group_id = var.instance_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 32768
  to_port                      = 65535
  description                  = "Dynamic container ports on the ECS machines"
}

resource "aws_lb" "this" {
  name                       = var.name
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.load_balancer.id]
  subnets                    = var.subnet_ids
  idle_timeout               = 60
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "app" {
  for_each = var.apps

  name                 = "${var.name}-${each.key}"
  port                 = each.value.port
  protocol             = "HTTP"
  target_type          = "instance"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = each.value.health_path
    matcher             = "200-399"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "app" {
  for_each = var.apps

  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.rule_ordinal

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }

  condition {
    host_header {
      values = each.value.hosts
    }
  }

  dynamic "condition" {
    for_each = each.value.behind_cdn ? [1] : []
    content {
      http_header {
        http_header_name = "X-Origin-Verify"
        values           = [var.origin_verify_secret]
      }
    }
  }
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Forwards every header, Host included, without adding any of them to the cache key.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "web" {
  for_each = local.cdn_apps

  enabled         = true
  comment         = "${var.name} ${each.key}"
  aliases         = each.value.hosts
  price_class     = "PriceClass_100"
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.this.dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret
    }
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # Next names these files by content hash, so a cached copy is never stale.
  ordered_cache_behavior {
    path_pattern             = "/_next/static/*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
