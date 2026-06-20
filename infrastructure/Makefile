INSIDE_CONTAINER := $(shell if [ -f "/.dockerenv" ]; then echo "true"; else echo "false"; fi)

ifeq ($(INSIDE_CONTAINER),true)
  WORKSPACE := $(shell terraform workspace show)
  BUCKET := $(shell cat backend.tf | grep bucket | awk '{print $$3}' | tr -d '"')
  TABLE := $(shell cat backend.tf | grep dynamodb_table | awk '{print $$3}' | tr -d '"')

  ifeq ($(WORKSPACE),default)
    REMOTE_TFVARS_PATH := "s3://$(BUCKET)/terraform.tfvars"
    LOCAL_TFVARS_PATH := "tfvars/terraform.tfvars"
    REMOTE_STATE_PATH := "$(BUCKET)/terraform.tfstate"
  else
    REMOTE_TFVARS_PATH := "s3://$(BUCKET)/env:/$(WORKSPACE)/terraform.tfvars"
    LOCAL_TFVARS_PATH := "tfvars/$(WORKSPACE)/terraform.tfvars"
    REMOTE_STATE_PATH := "$(BUCKET)/env:/$(WORKSPACE)/terraform.tfstate"
  endif
endif

.PHONY: push_vars pull_vars unlock fmt shell help download-runner-lambdas

push_vars:
	aws s3 cp --sse="AES256" $(LOCAL_TFVARS_PATH) $(REMOTE_TFVARS_PATH)

pull_vars:
	aws s3 cp --sse="AES256" $(REMOTE_TFVARS_PATH) $(LOCAL_TFVARS_PATH)

unlock:
	@LOCK_ID=$$(aws dynamodb get-item --table-name $(TABLE) --key '{"LockID":{"S":"$(REMOTE_STATE_PATH)"}}' --output json | jq -r '.Item.Info.S | fromjson.ID // empty'); \
	if [ -n "$$LOCK_ID" ]; then \
		echo "Found lock: $$LOCK_ID"; \
		terraform force-unlock -force $$LOCK_ID; \
	else \
		echo "No lock found"; \
	fi

fmt:
	terragrunt hclfmt
	terraform fmt -recursive .

shell:
ifeq ($(INSIDE_CONTAINER),true)
	@echo "Error: Already inside the container"
	@exit 1
else
	docker compose run --rm infra bash
endif

download-runner-lambdas:
	bash modules/github-runners/lambdas-download/download.sh

help:
	@echo "Available commands:"
	@echo "  make shell                  - Open a shell in the infrastructure container"
	@echo "  make fmt                    - Format Terraform and Terragrunt code"
	@echo "  make push_vars              - Push terraform.tfvars to S3"
	@echo "  make pull_vars              - Pull terraform.tfvars from S3"
	@echo "  make unlock                 - Force unlock the Terraform state"
	@echo "  make download-runner-lambdas - Download GitHub runner Lambda zips for bootstrap"
