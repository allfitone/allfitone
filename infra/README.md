# infra

Terraform for the AWS production environment. Operational policy lives in
`allfitone-docs/platform`; this file only says how to run what is here.

```
bootstrap/    state bucket, applied once with local state
production/   the only environment
modules/      network, budget, github-oidc
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
