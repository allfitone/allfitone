mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }
}

variables {
  name       = "allfit-test"
  cidr_block = "10.20.0.0/16"
}

run "spans_two_zones" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2
    error_message = "Public and private subnets must each cover exactly two zones."
  }

  assert {
    condition     = toset([for s in aws_subnet.public : s.availability_zone]) == toset(["us-east-1a", "us-east-1b"])
    error_message = "Public subnets must sit in the first two zones."
  }
}

run "private_subnets_have_no_internet_route" {
  command = plan

  assert {
    condition     = length(aws_route_table.private.route) == 0
    error_message = "The database tier must have no route out of the VPC."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.private : !s.map_public_ip_on_launch])
    error_message = "Private subnets must never hand out public addresses."
  }
}

run "public_subnets_reach_the_internet_without_nat" {
  command = plan

  assert {
    condition     = one(aws_route.public_internet[*].destination_cidr_block) == "0.0.0.0/0"
    error_message = "Public subnets need a default route to the internet gateway."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.public : s.map_public_ip_on_launch])
    error_message = "Instances in public subnets need a public address to reach the internet without NAT."
  }
}

run "default_security_group_is_closed" {
  command = plan

  assert {
    condition     = length(aws_default_security_group.closed.ingress) == 0 && length(aws_default_security_group.closed.egress) == 0
    error_message = "The default security group must allow nothing."
  }
}
