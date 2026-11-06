/**
 * Where the containers run: an ECS cluster backed by EC2 machines.
 *
 * The machines come from an Auto Scaling group with a fixed size: an on-demand
 * base (zero to start) and spot for the rest, which costs roughly half. ECS
 * learns about them through a capacity provider, which also keeps the group
 * from removing a machine while tasks still run on it.
 *
 * Machines live in the public subnets with a public address, because there is
 * no NAT; nothing reaches them except the load balancer, and only on the port
 * range bridge mode assigns to containers. IMDSv2 with a single hop lets the
 * ECS agent read instance metadata while a bridged container cannot, so an app
 * that is compromised does not inherit the machine's role.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# AWS publishes the current ECS-optimized image here; a new one arrives with the next machine.
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
}

resource "aws_ecs_cluster" "this" {
  name = var.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_iam_role" "instance" {
  name = "${var.name}-ecs-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "instance" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# Session Manager opens the database tunnel through this machine; no port is opened.
resource "aws_iam_role_policy_attachment" "session_manager" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.name}-ecs-instance"
  role = aws_iam_role.instance.name
}

resource "aws_security_group" "instances" {
  name        = "${var.name}-ecs-instances"
  description = "ECS machines: containers reachable only from the load balancer"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-ecs-instances" }
}

resource "aws_vpc_security_group_ingress_rule" "from_load_balancer" {
  security_group_id            = aws_security_group.instances.id
  referenced_security_group_id = var.load_balancer_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 32768
  to_port                      = 65535
  description                  = "Dynamic container ports, from the load balancer"
}

# Images, identity, e-mail, analytics and photo storage are all outside the VPC.
resource "aws_vpc_security_group_egress_rule" "internet" {
  security_group_id = aws_security_group.instances.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Outbound to AWS APIs and third-party services"
}

resource "aws_launch_template" "this" {
  name_prefix = "${var.name}-"
  image_id    = data.aws_ssm_parameter.ecs_ami.value

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }

  vpc_security_group_ids = [aws_security_group.instances.id]

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_gb
      volume_type           = "gp3"
      encrypted             = "true"
      delete_on_termination = "true"
    }
  }

  user_data = base64encode(<<-EOT
    #!/bin/bash
    cat >> /etc/ecs/ecs.config <<'CONFIG'
    ECS_CLUSTER=${aws_ecs_cluster.this.name}
    ECS_ENABLE_SPOT_INSTANCE_DRAINING=true
    CONFIG
  EOT
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-ecs" }
  }
}

resource "aws_autoscaling_group" "this" {
  name                  = "${var.name}-ecs"
  vpc_zone_identifier   = var.subnet_ids
  min_size              = var.instance_count
  max_size              = var.instance_count
  desired_capacity      = var.instance_count
  capacity_rebalance    = true
  protect_from_scale_in = true
  health_check_type     = "EC2"

  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = var.on_demand_base_capacity
      on_demand_percentage_above_base_capacity = 0
      spot_allocation_strategy                 = "price-capacity-optimized"
    }

    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.this.id
        version            = "$Latest"
      }

      dynamic "override" {
        for_each = var.instance_types
        content {
          instance_type = override.value
        }
      }
    }
  }

  # ECS looks for this tag on groups it manages through a capacity provider.
  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}

resource "aws_ecs_capacity_provider" "this" {
  name = "${var.name}-ec2"

  auto_scaling_group_provider {
    auto_scaling_group_arn         = aws_autoscaling_group.this.arn
    managed_termination_protection = "ENABLED"
    managed_draining               = "ENABLED"

    managed_scaling {
      status          = "ENABLED"
      target_capacity = 100
    }
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = [aws_ecs_capacity_provider.this.name]

  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.this.name
    weight            = 1
    base              = 0
  }
}
