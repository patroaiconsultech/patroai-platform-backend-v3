# PatroAI Platform — LLM 429 Diagnostic Premium Patch

Apply only after confirming exact repository, branch and commit.

This patch changes observability only. It does NOT change:
- OPENAI_API_KEY
- model
- retry
- timeout
- routing
- auth
- tenant
- database/migrations
- Realtime architecture

After application:
1. run compileall and pytest;
2. perform independent audit;
3. only after approval deploy to staging;
4. reproduce exactly one controlled LLM request;
5. inspect sanitized `LLM_PROVIDER_FAILURE`;
6. classify the 429 using evidence;
7. do not enable retry or switch model/key until the cause is proven.
