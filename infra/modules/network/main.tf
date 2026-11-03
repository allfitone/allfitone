/**
 * Network for a single environment: two zones, a public tier and a database tier.
 *
 * There is deliberately no NAT gateway. It bills by the hour whether or not
 * anything uses it, and nothing here needs it: compute runs in the public tier
 * with a public address (inbound is closed by security groups, not by routing),
 * and the database tier never needs to leave the VPC.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  zones = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.name }
}

# Taking over the default group strips its allow-all rules, so nothing can
# land in it by accident and get open egress.
resource "aws_default_security_group" "closed" {
  vpc_id = aws_vpc.this.id

  ingress = []
  egress  = []

  tags = { Name = "${var.name}-default-closed" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = var.name }
}

resource "aws_subnet" "public" {
  for_each = { for index, zone in local.zones : zone => index }

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.cidr_block, 8, each.value)
  map_public_ip_on_launch = true

  tags = { Name = "${var.name}-public-${each.key}", Tier = "public" }
}

resource "aws_subnet" "private" {
  for_each = { for index, zone in local.zones : zone => index }

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.cidr_block, 8, each.value + 10)
  map_public_ip_on_launch = false

  tags = { Name = "${var.name}-private-${each.key}", Tier = "private" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# No routes beyond the implicit local one: the database tier cannot reach out.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route  = []

  tags = { Name = "${var.name}-private" }
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}
