locals {
  workspace = run_cmd("--terragrunt-quiet", "terraform", "workspace", "show")
}

include "common" {
  path = "${get_terragrunt_dir()}/common/terragrunt.hcl"
}

terraform {
  extra_arguments "conditional_vars" {
    commands = get_terraform_commands_that_need_vars()

    required_var_files = [
      "tfvars/${local.workspace}/terraform.tfvars"
    ]
  }

  after_hook "upload_vars" {
    commands     = ["apply"]
    execute      = ["make", "push_vars"]
    run_on_error = false
  }
}
