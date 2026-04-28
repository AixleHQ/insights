#!/bin/bash
set -e

eval "$(jq -r '@sh "service=\(.service) cluster=\(.cluster) path_root=\(.path_root) environment=\(.environment)"')"

defaultImageTag="${environment}-latest"

path_root="$(echo $path_root | sed -e 's/^"//' -e 's/"$//' -e 's/\\\\/\\/g')"

taskDefinitionID="$(aws ecs describe-services --service $service --cluster $cluster | jq -r .services[0].taskDefinition)"

if [[ ! -z "$taskDefinitionID" && "$taskDefinitionID" != "null" ]]; then {
  taskDefinitionRevision="$(echo "$taskDefinitionID" | sed 's/^.*://')"
  taskDefinition="$(aws ecs describe-task-definition --task-definition $taskDefinitionID)"
  containerImage="$(echo "$taskDefinition" | jq -r .taskDefinition.containerDefinitions[0].image)"
  imageTag="$(echo "$containerImage" | awk -F':' '{print $2}')"
} else {
  imageTag=$defaultImageTag
  taskDefinitionRevision='0'
}
fi

jq -n --arg imageTag $imageTag --arg taskDefinitionRevision $taskDefinitionRevision '{image_tag: $imageTag, task_definition_revision: $taskDefinitionRevision}'

exit 0
