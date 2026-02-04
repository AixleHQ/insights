#!/bin/bash
# Wait for Keycloak to be ready
echo "Waiting for Keycloak to start..."
until /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null; do
  sleep 2
done

echo "Disabling SSL requirement on master realm..."
/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE

echo "SSL requirement disabled on master realm"
