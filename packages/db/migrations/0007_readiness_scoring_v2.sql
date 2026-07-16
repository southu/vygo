-- Stage 5: seed readiness_scoring_config v2 with five-dimension weights/rules.
-- Weights and rules are data — scoring code reads them from this table (or the
-- matching DEFAULT_SCORING_CONFIG fallback), never as hardcoded magic numbers.

INSERT INTO "readiness_scoring_config" ("config_key", "version", "rules", "weights", "active")
SELECT
	'default',
	2,
	'{
	  "version": 2,
	  "unknownPercentile": 0.25,
	  "manualRangeHalfWidth": 15,
	  "buckets": ["Not a fit", "Enterprise", "Scale", "Launch", "Harden"],
	  "pricing": {
	    "harden": "Harden $9,500 fixed",
	    "launch": "Launch from $75K",
	    "scale": "Scale from $145K",
	    "enterprise": "Enterprise $275K+",
	    "auditNote": "The audit locks scope and price and the $15K audit is credited toward the build."
	  },
	  "dimensions": [
	    {
	      "label": "Security",
	      "weight": 1.2,
	      "fields": [
	        {"field": "auth", "weight": 1.5},
	        {"field": "authorization", "weight": 1.5},
	        {"field": "row_level_security", "weight": 1.2},
	        {"field": "secrets_pattern", "weight": 1.3},
	        {"field": "api_surface", "weight": 0.8}
	      ]
	    },
	    {
	      "label": "Reliability",
	      "weight": 1.1,
	      "fields": [
	        {"field": "tests", "weight": 1.5},
	        {"field": "error_handling", "weight": 1.0},
	        {"field": "background_jobs", "weight": 0.8},
	        {"field": "fragility_flags", "weight": 1.2},
	        {"field": "logging", "weight": 0.7}
	      ]
	    },
	    {
	      "label": "Operability",
	      "weight": 1.0,
	      "fields": [
	        {"field": "deploys", "weight": 1.4},
	        {"field": "environments", "weight": 1.0},
	        {"field": "logging", "weight": 0.9},
	        {"field": "error_handling", "weight": 0.7},
	        {"field": "background_jobs", "weight": 0.6}
	      ]
	    },
	    {
	      "label": "Maintainability",
	      "weight": 0.9,
	      "fields": [
	        {"field": "structure", "weight": 1.2},
	        {"field": "languages", "weight": 0.7},
	        {"field": "size", "weight": 0.6},
	        {"field": "tests", "weight": 1.1},
	        {"field": "frontend", "weight": 0.5},
	        {"field": "backend", "weight": 0.5}
	      ]
	    },
	    {
	      "label": "Compliance posture",
	      "weight": 1.15,
	      "fields": [
	        {"field": "pii_categories", "weight": 1.4},
	        {"field": "tenancy", "weight": 1.1},
	        {"field": "auth", "weight": 1.0},
	        {"field": "authorization", "weight": 0.9},
	        {"field": "secrets_pattern", "weight": 0.8}
	      ]
	    }
	  ]
	}'::jsonb,
	'{
	  "dimension:Security": 1.2,
	  "dimension:Reliability": 1.1,
	  "dimension:Operability": 1.0,
	  "dimension:Maintainability": 0.9,
	  "dimension:Compliance posture": 1.15,
	  "auth": 1.5,
	  "authorization": 1.5,
	  "row_level_security": 1.2,
	  "secrets_pattern": 1.3,
	  "api_surface": 0.8,
	  "tests": 1.5,
	  "error_handling": 1.0,
	  "background_jobs": 0.8,
	  "fragility_flags": 1.2,
	  "logging": 0.9,
	  "deploys": 1.4,
	  "environments": 1.0,
	  "structure": 1.2,
	  "languages": 0.7,
	  "size": 0.6,
	  "frontend": 0.5,
	  "backend": 0.5,
	  "pii_categories": 1.4,
	  "tenancy": 1.1,
	  "confidence": 1.0
	}'::jsonb,
	true
WHERE NOT EXISTS (
	SELECT 1 FROM "readiness_scoring_config"
	WHERE "config_key" = 'default' AND "version" = 2
);
