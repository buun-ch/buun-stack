{{- with secret "auth/token/lookup-self" -}}
=== Vault Token Status ===
TTL: {{ .Data.ttl }} seconds
Renewable: {{ .Data.renewable }}
Expire Time: {{ .Data.expire_time }}
Policies: {{ range .Data.policies }}{{ . }} {{ end }}
Display Name: {{ .Data.display_name }}
Entity ID: {{ .Data.entity_id }}
Token Type: {{ .Data.type }}
===========================
{{- end -}}