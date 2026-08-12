#!/bin/bash
# Remove k3s netfilter rules stranded in an inactive iptables backend.
#
# The kernel evaluates the legacy (ip_tables) and nft rulesets at the same time,
# but k3s-killall.sh only cleans the backend that the default `iptables` binary
# resolves to. Rules written by an earlier installation through the other backend
# therefore survive uninstall and stay resident until the node reboots. Once a new
# pod is assigned an IP that a stale KUBE-POD-FW chain still references, that chain
# rejects the pod's traffic and the pod fails to reach the API server.

set -uo pipefail

cleaned=0

for family in iptables ip6tables; do
    active=$(readlink -f "$(command -v "${family}")" 2>/dev/null)
    [ -n "${active}" ] || continue

    for backend in legacy nft; do
        binary="${family}-${backend}"
        save="${binary}-save"
        restore="${binary}-restore"

        command -v "${save}" >/dev/null 2>&1 || continue
        command -v "${restore}" >/dev/null 2>&1 || continue

        # Never touch the backend holding the live ruleset
        [ "$(readlink -f "$(command -v "${binary}")" 2>/dev/null)" = "${active}" ] && continue

        count=$("${save}" 2>/dev/null | grep -cE '^:(KUBE-|CNI-|FLANNEL)')
        count=${count:-0}
        [ "${count}" -eq 0 ] && continue

        echo "Removing ${count} stale chains from ${binary}"
        "${save}" | grep -v KUBE- | grep -v CNI- | grep -iv flannel | "${restore}"
        cleaned=$((cleaned + count))
    done
done

if [ "${cleaned}" -eq 0 ]; then
    echo "No stale netfilter rules found"
else
    echo "✓ Removed ${cleaned} stale chains"
fi
