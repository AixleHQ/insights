LOG_PERIOD ?= 5m
REGION = us-east-2

.DEFAULT_GOAL := exec_staging_api

define get_task
$(shell aws ecs list-tasks --cluster $(1) --service-name $(2) --region $(REGION) --query 'taskArns[0]' --output text)
endef

# --- Exec (staging) ---

exec_staging_api:
	@aws ecs execute-command --cluster db90-staging-cluster --task $(call get_task,db90-staging-cluster,db90-staging-api) --container api --command /bin/bash --interactive --region $(REGION)

exec_staging_web:
	@aws ecs execute-command --cluster db90-staging-cluster --task $(call get_task,db90-staging-cluster,db90-staging-web) --container web --command /bin/bash --interactive --region $(REGION)

exec_staging_sidekiq:
	@aws ecs execute-command --cluster db90-staging-cluster --task $(call get_task,db90-staging-cluster,db90-staging-sidekiq) --container sidekiq --command /bin/bash --interactive --region $(REGION)

exec_staging_temporal:
	@aws ecs execute-command --cluster db90-staging-cluster --task $(call get_task,db90-staging-cluster,db90-staging-temporal) --container temporal --command /bin/bash --interactive --region $(REGION)

exec_staging_keycloak:
	@aws ecs execute-command --cluster db90-staging-cluster --task $(call get_task,db90-staging-cluster,db90-staging-keycloak) --container keycloak --command /bin/bash --interactive --region $(REGION)

# --- Logs (staging) ---

staging_api_logs:
	aws logs tail db90-staging-api --since $(LOG_PERIOD) --region $(REGION)

staging_web_logs:
	aws logs tail db90-staging-web --since $(LOG_PERIOD) --region $(REGION)

staging_keycloak_logs:
	aws logs tail db90-staging-keycloak --since $(LOG_PERIOD) --region $(REGION)

staging_temporal_logs:
	aws logs tail db90-staging-temporal --since $(LOG_PERIOD) --region $(REGION)

staging_sidekiq_logs:
	aws logs tail db90-staging-sidekiq --since $(LOG_PERIOD) --region $(REGION)

watch_staging_api_logs:
	aws logs tail db90-staging-api --follow --region $(REGION)

watch_staging_web_logs:
	aws logs tail db90-staging-web --follow --region $(REGION)

watch_staging_keycloak_logs:
	aws logs tail db90-staging-keycloak --follow --region $(REGION)

watch_staging_temporal_logs:
	aws logs tail db90-staging-temporal --follow --region $(REGION)

watch_staging_sidekiq_logs:
	aws logs tail db90-staging-sidekiq --follow --region $(REGION)

# --- Exec (production — matches Terraform var.environment = "production") ---

exec_prod_api:
	@aws ecs execute-command --cluster db90-production-cluster --task $(call get_task,db90-production-cluster,db90-production-api) --container api --command /bin/bash --interactive --region $(REGION)

exec_prod_web:
	@aws ecs execute-command --cluster db90-production-cluster --task $(call get_task,db90-production-cluster,db90-production-web) --container web --command /bin/bash --interactive --region $(REGION)

exec_prod_keycloak:
	@aws ecs execute-command --cluster db90-production-cluster --task $(call get_task,db90-production-cluster,db90-production-keycloak) --container keycloak --command /bin/bash --interactive --region $(REGION)

# --- Logs (production) ---

prod_api_logs:
	aws logs tail db90-production-api --since $(LOG_PERIOD) --region $(REGION)

prod_web_logs:
	aws logs tail db90-production-web --since $(LOG_PERIOD) --region $(REGION)

prod_keycloak_logs:
	aws logs tail db90-production-keycloak --since $(LOG_PERIOD) --region $(REGION)

prod_temporal_logs:
	aws logs tail db90-production-temporal --since $(LOG_PERIOD) --region $(REGION)

prod_sidekiq_logs:
	aws logs tail db90-production-sidekiq --since $(LOG_PERIOD) --region $(REGION)

watch_prod_api_logs:
	aws logs tail db90-production-api --follow --region $(REGION)

watch_prod_web_logs:
	aws logs tail db90-production-web --follow --region $(REGION)

watch_prod_keycloak_logs:
	aws logs tail db90-production-keycloak --follow --region $(REGION)

watch_prod_temporal_logs:
	aws logs tail db90-production-temporal --follow --region $(REGION)

watch_prod_sidekiq_logs:
	aws logs tail db90-production-sidekiq --follow --region $(REGION)

# --- Deploy (staging) ---

deploy_staging_api:
	ENVIRONMENT=staging APPLICATION=api ecs_helper deploy --timeout 3600

deploy_staging_web:
	ENVIRONMENT=staging APPLICATION=web ecs_helper deploy --timeout 3600

deploy_staging_sidekiq:
	ENVIRONMENT=staging APPLICATION=sidekiq ecs_helper deploy --timeout 3600

deploy_staging_keycloak:
	ENVIRONMENT=staging APPLICATION=keycloak ecs_helper deploy --timeout 3600

deploy_staging_temporal_worker:
	ENVIRONMENT=staging APPLICATION=temporal-worker ecs_helper deploy --timeout 3600

deploy_staging_all: deploy_staging_api deploy_staging_web deploy_staging_sidekiq deploy_staging_keycloak deploy_staging_temporal_worker

# --- Deploy (production; ENVIRONMENT must match CI / ECR tags: production-latest) ---

deploy_prod_api:
	ENVIRONMENT=production APPLICATION=api ecs_helper deploy --timeout 3600

deploy_prod_web:
	ENVIRONMENT=production APPLICATION=web ecs_helper deploy --timeout 3600

deploy_prod_sidekiq:
	ENVIRONMENT=production APPLICATION=sidekiq ecs_helper deploy --timeout 3600

deploy_prod_keycloak:
	ENVIRONMENT=production APPLICATION=keycloak ecs_helper deploy --timeout 3600

deploy_prod_temporal_worker:
	ENVIRONMENT=production APPLICATION=temporal-worker ecs_helper deploy --timeout 3600

deploy_prod_all: deploy_prod_api deploy_prod_web deploy_prod_sidekiq deploy_prod_keycloak deploy_prod_temporal_worker
