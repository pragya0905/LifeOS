# Alexa integration — manual setup

The backend (Cognito OAuth domain, Alexa app client, and the
`alexaSkillHandler` Lambda) deploys via `sam deploy` like everything else.
Registering the actual Alexa skill does not — it happens in the
[Alexa Developer Console](https://developer.amazon.com/alexa/console/ask),
a separate Amazon portal, not part of AWS. This is a one-time, by-hand
setup (or scriptable later with Amazon's `ask-cli` if that's ever worth
doing). The skill can stay in **Development** status the whole time — it
never needs to be submitted for certification or published to the public
Alexa Skills Store, since it only ever needs to work on devices linked to
your own Amazon developer account.

## 1. Create the skill

1. Sign in to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask)
   with your Amazon account (same account your Echo devices are registered
   to).
2. **Create Skill** → name it (e.g. "LifeOs") → model: **Custom** →
   hosting method: **Provision your own** (since the backend is the
   existing `alexaSkillHandler` Lambda, not Alexa-hosted).

## 2. Interaction model

Under **Build → Interaction Model → JSON Editor**, define the 5 custom
intents from `backend/src/functions/alexaSkillHandler/index.ts`, each with
a handful of sample utterances and the slots below. Exact utterance
phrasing is yours to tune once you're testing with real speech, but the
slot names and types must match what the handler reads via
`Alexa.getSlotValue(...)`.

| Intent | Slots | Slot types |
|---|---|---|
| `LogHabitIntent` | `habitType`, `amount` | `habitType`: custom type with values `water`, `exercise`, `steps`. `amount`: `AMAZON.NUMBER` |
| `DictateJournalIntent` | `entryText` | `AMAZON.SearchQuery` (catch-all free speech) |
| `CreateTaskIntent` | `title`, `dueDate`, `dueTime` | `title`: `AMAZON.SearchQuery`. `dueDate`: `AMAZON.DATE`. `dueTime`: `AMAZON.TIME` |
| `GetScheduleIntent` | `date` | `AMAZON.DATE` |
| `GetTasksIntent` | — | — |

Example sample utterances:

- `LogHabitIntent`: "log {amount} milliliters of {habitType}", "I drank {amount} of water" (map to habitType=water separately if not spoken)
- `DictateJournalIntent`: "tell LifeOs {entryText}", "write in my journal {entryText}"
- `CreateTaskIntent`: "add a task {title}", "add a task {title} due {dueDate}", "remind me to {title} at {dueTime}"
- `GetScheduleIntent`: "what's on my schedule", "what's on my schedule {date}"
- `GetTasksIntent`: "what are my tasks", "how many pending tasks do I have"

Keep the built-in `AMAZON.HelpIntent`, `AMAZON.CancelIntent`,
`AMAZON.StopIntent`, and `AMAZON.FallbackIntent` — the console adds these
by default; the handler already implements the first three.

## 3. Endpoint

Under **Build → Endpoint**: select **AWS Lambda ARN**, and paste the value
of the deployed stack's `AlexaSkillHandlerArn` output
(`aws cloudformation describe-stacks --stack-name lifeos-backend-dev
--query "Stacks[0].Outputs"`).

## 4. Account linking

Under **Build → Account Linking**, turn it on and fill in, using the
stack's outputs:

| Field | Value |
|---|---|
| Authorization URI | `AlexaOAuthAuthorizeUrl` output |
| Access Token URI | `AlexaOAuthTokenUrl` output |
| Client ID | `AlexaUserPoolClientId` output |
| Client Secret | The `AlexaUserPoolClient`'s generated secret — retrieve via `aws cognito-idp describe-user-pool-client --user-pool-id <UserPoolId> --client-id <AlexaUserPoolClientId>` (not a stack output, since CloudFormation doesn't expose secrets in plaintext outputs) |
| Client Authentication Scheme | HTTP Basic |
| Scope | `openid`, `email` |
| Domain list | leave default |

Saving this screen is what generates the **actual** redirect URI Amazon
assigns for this specific skill. Copy it and add it to
`AlexaUserPoolClient.CallbackURLs` in `backend/template.yaml` if it isn't
already one of the three well-known regional URIs already listed there
(`pitangui`/`layla`/`alexa.amazon.co.jp`), then redeploy.

## 5. Lock down the Lambda permission (optional but recommended)

`AlexaSkillHandlerPermission` in `template.yaml` currently grants any
Alexa skill permission to invoke the Lambda. Once you have this specific
skill's ID (shown at the top of the Developer Console, format
`amzn1.ask.skill.xxxxxxxx-...`), tighten it:

```yaml
AlexaSkillHandlerPermission:
  Type: AWS::Lambda::Permission
  Properties:
    Action: lambda:InvokeFunction
    FunctionName: !Ref AlexaSkillHandlerFunction
    Principal: alexa-appkit.amazon.com
    EventSourceToken: amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Redeploy after adding it.

## 6. Test

**Test** tab in the console (set to "Development") lets you type or speak
utterances directly — no physical Echo device required. First launch will
prompt account linking (same OAuth flow, done once); after that, each
intent should produce a real effect against your actual LifeOs data
(a task really appears in the app, a dictated journal entry really
triggers Claude extraction, etc.) — verify against the app itself, not
just Alexa's spoken response, the same way every other feature in this
project has been verified.
