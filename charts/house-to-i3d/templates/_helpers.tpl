{{- define "hx.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "hx.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "hx.labels" -}}
app.kubernetes.io/name: {{ include "hx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/* Selector labels for one part: include "hx.selector" (list . "api") */}}
{{- define "hx.selector" -}}
{{- $ := index . 0 -}}
app.kubernetes.io/name: {{ include "hx.name" $ }}
app.kubernetes.io/instance: {{ $.Release.Name }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end -}}

{{- define "hx.image" -}}
{{- $ := index . 0 -}}
{{- $img := index . 1 -}}
{{- printf "%s/%s:%s" $.Values.image.registry $img.repository (default $.Chart.AppVersion $img.tag) -}}
{{- end -}}

{{/* The address people open: publicUrl, else the route's or the ingress's host. */}}
{{- define "hx.publicUrl" -}}
{{- if .Values.publicUrl -}}
{{- .Values.publicUrl | trimSuffix "/" -}}
{{- else if and .Values.httpRoute.enabled .Values.httpRoute.hostnames -}}
{{- printf "%s://%s" (ternary "https" "http" .Values.httpRoute.tls) (first .Values.httpRoute.hostnames) -}}
{{- else if and .Values.ingress.enabled .Values.ingress.host -}}
{{- printf "%s://%s" (ternary "https" "http" .Values.ingress.tls.enabled) .Values.ingress.host -}}
{{- else -}}
{{- fail "Set publicUrl (the address people open, like https://hus.example.se), or enable the httpRoute (or the ingress) with a host." -}}
{{- end -}}
{{- end -}}

{{- define "hx.postgres" -}}{{ eq .Values.database.type "postgres" }}{{- end -}}
{{- define "hx.bundledPostgres" -}}{{ and (eq .Values.database.type "postgres") .Values.database.postgres.deploy }}{{- end -}}

{{/* Checks the values make sense together. */}}
{{- define "hx.validate" -}}
{{- $t := .Values.database.type -}}
{{- if not (has $t (list "sqlite" "postgres")) -}}
{{- fail (printf "database.type must be sqlite or postgres, not %q." $t) -}}
{{- end -}}
{{- if and (eq $t "sqlite") (gt (int .Values.api.replicas) 1) -}}
{{- fail "SQLite allows one API pod: set api.replicas to 1, or use database.type=postgres." -}}
{{- end -}}
{{- $pg := .Values.database.postgres -}}
{{- if and (eq $t "postgres") (not $pg.deploy) (not $pg.url) (not $pg.existingSecret) -}}
{{- fail "With database.postgres.deploy=false, set database.postgres.url or database.postgres.existingSecret." -}}
{{- end -}}
{{- end -}}

{{/* Where the API finds DATABASE_URL, as a secretKeyRef body (name + key). */}}
{{- define "hx.databaseUrlRef" -}}
{{- $pg := .Values.database.postgres -}}
{{- if $pg.deploy -}}
name: {{ include "hx.fullname" . }}-db
key: DATABASE_URL
{{- else if $pg.existingSecret -}}
name: {{ $pg.existingSecret }}
key: {{ $pg.existingSecretKey }}
{{- else -}}
name: {{ include "hx.fullname" . }}
key: DATABASE_URL
{{- end -}}
{{- end -}}

{{- define "hx.podSecurity" -}}
runAsNonRoot: true
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "hx.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: [ALL]
{{- end -}}
