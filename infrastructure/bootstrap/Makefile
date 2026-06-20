INSIDE_CONTAINER := $(shell if [ -f "/.dockerenv" ]; then echo "true"; else echo "false"; fi)

BUCKET              := db90-tf-bucket
REMOTE_TFVARS_PATH  := s3://$(BUCKET)/bootstrap/terraform.tfvars
LOCAL_TFVARS_PATH   := terraform.tfvars

.PHONY: init init-local migrate-state plan apply fmt push_vars pull_vars help

help:
	@echo "Bootstrap Terraform (shared account resources)"
	@echo ""
	@echo "  make init-local     - First apply on a blank AWS account (local state, creates S3 bucket)"
	@echo "  make migrate-state  - Move local state to S3 after init-local (or legacy local state)"
	@echo "  make init           - Init with remote S3 backend (normal day-to-day)"
	@echo "  make plan           - terraform plan"
	@echo "  make apply          - terraform apply, then upload tfvars to S3"
	@echo "  make push_vars      - Upload terraform.tfvars to S3"
	@echo "  make pull_vars      - Download terraform.tfvars from S3"
	@echo "  make fmt            - terraform fmt"

init-local:
	terraform init -backend=false

migrate-state:
	terraform init -migrate-state

init:
	terraform init

plan:
	terraform plan

apply:
	terraform apply
	@$(MAKE) push_vars

push_vars:
	@test -f $(LOCAL_TFVARS_PATH) || (echo "Error: $(LOCAL_TFVARS_PATH) not found" >&2; exit 1)
	aws s3 cp --sse="AES256" $(LOCAL_TFVARS_PATH) $(REMOTE_TFVARS_PATH)

pull_vars:
	aws s3 cp --sse="AES256" $(REMOTE_TFVARS_PATH) $(LOCAL_TFVARS_PATH)

fmt:
	terraform fmt -recursive .

ifeq ($(INSIDE_CONTAINER),true)
  $(info Running inside infrastructure container)
endif
