-- Stage 4 readiness follow-up question bank seed.
-- Data-driven prompts (never hardcoded in route handlers at runtime beyond this seed).
-- Metadata carries type, trigger, and options for the follow-up API.

INSERT INTO "readiness_question_bank" ("question_key", "prompt", "category", "sort_order", "active", "metadata")
SELECT v.question_key, v.prompt, v.category, v.sort_order, true, v.metadata::jsonb
FROM (VALUES
	(
		'users_today',
		'How many users do you have today?',
		'followup',
		200,
		'{"stage":4,"type":"range","trigger":"always","options":["0–10","11–100","101–1,000","1,001–10,000","10,000+","not sure"],"helper":"Pick the closest range."}'
	),
	(
		'users_12_months',
		'How many users do you expect in 12 months?',
		'followup',
		210,
		'{"stage":4,"type":"range","trigger":"always","options":["0–10","11–100","101–1,000","1,001–10,000","10,000+","not sure"],"helper":"Pick the closest range."}'
	),
	(
		'done_looks_like',
		'What does “done” look like for this engagement?',
		'followup',
		220,
		'{"stage":4,"type":"text","trigger":"always","helper":"One or two short sentences."}'
	),
	(
		'budget',
		'What budget range are you considering?',
		'followup',
		230,
		'{"stage":4,"type":"single","trigger":"always","options":["<$25K","$25–75K","$75–150K","$150K+","no idea yet"]}'
	),
	(
		'security_framework',
		'Which security / compliance questionnaire framework do you need to pass?',
		'followup_conditional',
		300,
		'{"stage":4,"type":"multi","trigger":"security_questionnaire","options":["SOC 2","ISO 27001","HIPAA","PCI DSS","FedRAMP","Other / not sure"]}'
	),
	(
		'tests_on_every_deploy',
		'Do automated tests run on every deploy today?',
		'followup_conditional',
		310,
		'{"stage":4,"type":"single","trigger":"tests_on_deploy","options":["Yes, required in CI","Sometimes","No","Not sure"]}'
	),
	(
		'payment_health_pii_prod',
		'Do you process payment data or health PII in production?',
		'followup_conditional',
		320,
		'{"stage":4,"type":"single","trigger":"payment_health_pii","options":["Payment data","Health PII","Both","Neither","Not sure"]}'
	),
	(
		'sso_saml',
		'Do enterprise customers require SSO / SAML?',
		'followup_conditional',
		330,
		'{"stage":4,"type":"single","trigger":"sso_saml","options":["Required now","Required soon","Nice to have","No","Not sure"]}'
	),
	(
		'who_deploys',
		'Who deploys to production today?',
		'followup_conditional',
		340,
		'{"stage":4,"type":"single","trigger":"who_deploys","options":["Automated CI/CD only","Engineer clicks one-click deploy","Manual / SSH / console","Agency / contractor","Not sure"]}'
	),
	(
		'repo_access_audit',
		'Can Vygo get temporary read-only repo access for the audit?',
		'followup_conditional',
		350,
		'{"stage":4,"type":"single","trigger":"repo_access","options":["Yes","Maybe — need approval","No","Not sure"]}'
	)
) AS v(question_key, prompt, category, sort_order, metadata)
WHERE NOT EXISTS (
	SELECT 1 FROM "readiness_question_bank" q WHERE q."question_key" = v.question_key
);

-- Refresh metadata/prompts for existing rows (idempotent upsert of seed content).
UPDATE "readiness_question_bank" AS q
SET
	"prompt" = v.prompt,
	"category" = v.category,
	"sort_order" = v.sort_order,
	"active" = true,
	"metadata" = v.metadata::jsonb
FROM (VALUES
	('users_today', 'How many users do you have today?', 'followup', 200,
	 '{"stage":4,"type":"range","trigger":"always","options":["0–10","11–100","101–1,000","1,001–10,000","10,000+","not sure"],"helper":"Pick the closest range."}'),
	('users_12_months', 'How many users do you expect in 12 months?', 'followup', 210,
	 '{"stage":4,"type":"range","trigger":"always","options":["0–10","11–100","101–1,000","1,001–10,000","10,000+","not sure"],"helper":"Pick the closest range."}'),
	('done_looks_like', 'What does “done” look like for this engagement?', 'followup', 220,
	 '{"stage":4,"type":"text","trigger":"always","helper":"One or two short sentences."}'),
	('budget', 'What budget range are you considering?', 'followup', 230,
	 '{"stage":4,"type":"single","trigger":"always","options":["<$25K","$25–75K","$75–150K","$150K+","no idea yet"]}'),
	('security_framework', 'Which security / compliance questionnaire framework do you need to pass?', 'followup_conditional', 300,
	 '{"stage":4,"type":"multi","trigger":"security_questionnaire","options":["SOC 2","ISO 27001","HIPAA","PCI DSS","FedRAMP","Other / not sure"]}'),
	('tests_on_every_deploy', 'Do automated tests run on every deploy today?', 'followup_conditional', 310,
	 '{"stage":4,"type":"single","trigger":"tests_on_deploy","options":["Yes, required in CI","Sometimes","No","Not sure"]}'),
	('payment_health_pii_prod', 'Do you process payment data or health PII in production?', 'followup_conditional', 320,
	 '{"stage":4,"type":"single","trigger":"payment_health_pii","options":["Payment data","Health PII","Both","Neither","Not sure"]}'),
	('sso_saml', 'Do enterprise customers require SSO / SAML?', 'followup_conditional', 330,
	 '{"stage":4,"type":"single","trigger":"sso_saml","options":["Required now","Required soon","Nice to have","No","Not sure"]}'),
	('who_deploys', 'Who deploys to production today?', 'followup_conditional', 340,
	 '{"stage":4,"type":"single","trigger":"who_deploys","options":["Automated CI/CD only","Engineer clicks one-click deploy","Manual / SSH / console","Agency / contractor","Not sure"]}'),
	('repo_access_audit', 'Can Vygo get temporary read-only repo access for the audit?', 'followup_conditional', 350,
	 '{"stage":4,"type":"single","trigger":"repo_access","options":["Yes","Maybe — need approval","No","Not sure"]}')
) AS v(question_key, prompt, category, sort_order, metadata)
WHERE q."question_key" = v.question_key;
