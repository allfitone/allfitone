mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "ami-0123456789abcdef0"
    }
  }
}

variables {
  name                            = "allfit-test"
  vpc_id                          = "vpc-0123456789abcdef0"
  subnet_ids                      = ["subnet-aaaa", "subnet-bbbb"]
  load_balancer_security_group_id = "sg-0alb0000000000000"
  instance_count                  = 1
  on_demand_base_capacity         = 0
}

run "starts_with_one_spot_machine" {
  command = plan

  assert {
    condition = (
      aws_autoscaling_group.this.min_size == 1
      && aws_autoscaling_group.this.max_size == 1
      && aws_autoscaling_group.this.desired_capacity == 1
    )
    error_message = "The machine count is fixed by instance_count, so the bill is too."
  }

  assert {
    condition = (
      aws_autoscaling_group.this.mixed_instances_policy[0].instances_distribution[0].on_demand_base_capacity == 0
      && aws_autoscaling_group.this.mixed_instances_policy[0].instances_distribution[0].on_demand_percentage_above_base_capacity == 0
    )
    error_message = "Everything above the on-demand base must be spot."
  }
}

run "launch_adds_an_on_demand_base" {
  command = plan

  variables {
    instance_count          = 2
    on_demand_base_capacity = 1
  }

  assert {
    condition     = aws_autoscaling_group.this.mixed_instances_policy[0].instances_distribution[0].on_demand_base_capacity == 1
    error_message = "One on-demand machine must survive any spot interruption."
  }

  assert {
    condition     = aws_autoscaling_group.this.max_size == 2
    error_message = "The group follows instance_count."
  }
}

run "spot_drains_before_the_machine_goes" {
  command = plan

  assert {
    condition     = strcontains(base64decode(aws_launch_template.this.user_data), "ECS_ENABLE_SPOT_INSTANCE_DRAINING=true")
    error_message = "ECS must move tasks off a machine as soon as AWS announces the interruption."
  }

  assert {
    condition     = aws_autoscaling_group.this.capacity_rebalance == true
    error_message = "The group should replace a spot machine at risk before it is interrupted."
  }
}

run "containers_cannot_borrow_the_machine_role" {
  command = plan

  assert {
    condition = (
      aws_launch_template.this.metadata_options[0].http_tokens == "required"
      && aws_launch_template.this.metadata_options[0].http_put_response_hop_limit == 1
    )
    error_message = "IMDSv2 with one hop: the agent reads metadata, a bridged container cannot."
  }

  assert {
    condition     = aws_launch_template.this.block_device_mappings[0].ebs[0].encrypted == "true"
    error_message = "The root volume must be encrypted."
  }
}

run "only_the_load_balancer_reaches_the_machines" {
  command = plan

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.from_load_balancer.referenced_security_group_id == "sg-0alb0000000000000"
      && aws_vpc_security_group_ingress_rule.from_load_balancer.cidr_ipv4 == null
    )
    error_message = "Ingress comes from the load balancer's group, never from an address range."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.from_load_balancer.from_port == 32768
      && aws_vpc_security_group_ingress_rule.from_load_balancer.to_port == 65535
    )
    error_message = "Only the dynamic port range that bridge mode hands to containers is open."
  }
}

run "ecs_owns_the_capacity" {
  command = plan

  assert {
    condition     = aws_ecs_capacity_provider.this.auto_scaling_group_provider[0].managed_termination_protection == "ENABLED"
    error_message = "ECS must decide when a machine with tasks may go."
  }

  assert {
    condition     = aws_autoscaling_group.this.protect_from_scale_in == true
    error_message = "Managed termination protection requires scale-in protection on the group."
  }
}
