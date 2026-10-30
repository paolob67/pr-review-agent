# Sourced by every script in this directory. All names come from here (PLAN section 6).
# Override any value from the environment before calling a script. No secrets in this file.

CE_REGION="${CE_REGION:-eu-de}"
# Existing group (the account does not allow creating one). Scripts never create or delete it.
CE_RESOURCE_GROUP="${CE_RESOURCE_GROUP:-eid-6ae4f3be2e6256f0f91842aa}"
CE_PROJECT="${CE_PROJECT:-bob-pr-reviewer}"

# Container Registry: regional domain for eu-de is de.icr.io (ibmcloud cr region-set eu-central).
CR_REGION="${CR_REGION:-eu-central}"
CR_DOMAIN="${CR_DOMAIN:-de.icr.io}"
CR_NAMESPACE="${CR_NAMESPACE:-bob-pr-reviewer}"
IMAGE_NAME="${IMAGE_NAME:-pr-reviewer}"

CE_JOB="${CE_JOB:-pr-reviewer}"
BOB_SECRET="${BOB_SECRET:-bob-creds}"
SCM_SECRET="${SCM_SECRET:-scm-creds}"
REGISTRY_SECRET="${REGISTRY_SECRET:-icr-access}"

# Service IDs: the CI submitter (G25) and the registry access used by builds and job pulls.
CI_SERVICE_ID="${CI_SERVICE_ID:-bob-pr-reviewer-ci}"
REGISTRY_SERVICE_ID="${REGISTRY_SERVICE_ID:-bob-pr-reviewer-registry}"

# Job sizing (CONTRACTS section 6 cost record: 1 vCPU, 4 GB) and limits (G13, retries off).
JOB_CPU="${JOB_CPU:-1}"
JOB_MEMORY="${JOB_MEMORY:-4G}"
JOB_MAX_EXECUTION_SECONDS="${JOB_MAX_EXECUTION_SECONDS:-600}"
JOB_RETRY_LIMIT=0

# Bob user inside the container (S11). The wrapper starts as root and spawns Bob under this UID/GID.
BOB_UID=10002
BOB_GID=10002

require_login() {
  ibmcloud target >/dev/null 2>&1 || { echo "ibmcloud is not logged in; run 'ibmcloud login' first" >&2; exit 1; }
}

target_group() {
  ibmcloud target -r "$CE_REGION" -g "$CE_RESOURCE_GROUP" >/dev/null
  ibmcloud cr region-set "$CR_REGION" >/dev/null
}

select_project() {
  ibmcloud ce project select --name "$CE_PROJECT" >/dev/null
}
