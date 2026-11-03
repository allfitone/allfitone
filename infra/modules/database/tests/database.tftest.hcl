mock_provider "aws" {}

variables {
  name                      = "allfit-test"
  vpc_id                    = "vpc-0123456789abcdef0"
  private_subnet_ids        = ["subnet-aaaa", "subnet-bbbb"]
  client_security_group_ids = { client = "sg-0client000000000a" }
  instance_class            = "db.t4g.micro"
  allocated_storage_gb      = 20
  max_allocated_storage_gb  = 100
  environment_secret_id     = "arn:aws:secretsmanager:us-east-1:000000000000:secret:allfitone/test"
  master_password           = "only-for-the-test-0123456789abcdefghij"
}

run "never_reachable_from_the_internet" {
  command = plan

  assert {
    condition     = aws_db_instance.this.publicly_accessible == false
    error_message = "The database must never get a public address."
  }

  assert {
    condition     = aws_db_subnet_group.this.subnet_ids == toset(["subnet-aaaa", "subnet-bbbb"])
    error_message = "The database must live only in the private subnets."
  }
}

run "only_known_clients_reach_postgres" {
  command = plan

  assert {
    condition = alltrue([
      for rule in aws_vpc_security_group_ingress_rule.postgres :
      rule.from_port == 5432 && rule.to_port == 5432 && rule.cidr_ipv4 == null
    ])
    error_message = "Ingress is 5432 only, and only from security groups, never from an address range."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.postgres) == 1
    error_message = "Each client security group gets exactly one rule."
  }
}

run "protects_health_data_at_rest_and_in_transit" {
  command = plan

  assert {
    condition     = aws_db_instance.this.storage_encrypted == true
    error_message = "Storage must be encrypted."
  }

  assert {
    condition = anytrue([
      for p in aws_db_parameter_group.this.parameter : p.name == "rds.force_ssl" && p.value == "1"
    ])
    error_message = "Connections without TLS must be refused."
  }
}

run "single_zone_unless_asked" {
  command = plan

  assert {
    condition     = aws_db_instance.this.multi_az == false
    error_message = "One zone was decided; a standby is opt-in through multi_az."
  }
}

run "survives_a_mistake" {
  command = plan

  assert {
    condition     = aws_db_instance.this.backup_retention_period >= 7
    error_message = "Keep at least seven days of point-in-time recovery."
  }

  assert {
    condition     = aws_db_instance.this.deletion_protection == true && aws_db_instance.this.skip_final_snapshot == false
    error_message = "Deleting the database must be blocked, and must leave a final snapshot."
  }
}

run "no_password_in_code_or_state" {
  command = plan

  assert {
    condition     = aws_db_instance.this.password == null && aws_db_instance.this.password_wo_version == 1
    error_message = "The master password is write-only: generated per apply, sent once, never stored in state."
  }

  assert {
    condition     = aws_secretsmanager_secret_version.database.secret_string == null && aws_secretsmanager_secret_version.database.secret_string_wo_version == 1
    error_message = "The environment secret receives the password write-only too."
  }

  assert {
    condition     = aws_secretsmanager_secret_version.database.secret_id == "arn:aws:secretsmanager:us-east-1:000000000000:secret:allfitone/test"
    error_message = "Database credentials go into the environment's single secret."
  }
}

run "runs_postgres_17_like_local" {
  command = plan

  assert {
    condition     = startswith(aws_db_instance.this.engine_version, "17")
    error_message = "Production must match the local engine, Postgres 17."
  }
}
