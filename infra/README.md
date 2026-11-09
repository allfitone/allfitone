# infra

Terraform for the AWS production environment. Operational policy lives in
`allfitone-docs/platform`; this file only says how to run what is here.

```
bootstrap/    state bucket, applied once with local state
production/   the only environment
modules/      network, budget, github-oidc, database, registry, compute,
              certificate, email, edge, services, deploy-role
docker/       images: node-service, next, migrator
scripts/      what the deploy workflows run, with its tests
```

Access is through IAM Identity Center (`aws sso login --profile allfitone`).
Never create IAM access keys for people.

```sh
export AWS_PROFILE=allfitone
cd infra/production
cp backend.hcl.example backend.hcl        # fill in the bucket
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan -out=plan.tfplan
```

Module tests run without credentials: `terraform test` inside each module.

## Releasing

A merge to `main` runs `Deploy AWS`: it builds the six images tagged with the
commit SHA and rolls the services onto them. Dispatch it by hand to redeploy the
current release, for example after changing the environment secret.

The pipeline owns which image runs; Terraform owns everything else. A Terraform
change to a task definition reaches the services with the next deploy.

Migrations run only by hand: dispatch `Deploy database (AWS)` once `Deploy AWS`
has finished for that commit.
