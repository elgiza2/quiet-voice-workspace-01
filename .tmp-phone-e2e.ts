import { ensureCallControlApp, assignNumber, dialOut } from "@/lib/phone/telnyx.server";
const owner = "a1e35110-8cad-4626-b4ea-0afe20075b03", bot = "a49b0ab6-00eb-4291-bd21-a22b33360612";
console.log("app", await ensureCallControlApp());
console.log("line", await assignNumber(owner, bot));
const callId = crypto.randomUUID();
console.log("dial", await dialOut({ userId: owner, botId: bot, conversationId: "ea3f641c-ec65-4974-8cd1-bcb23ab82094", to: "+12352047886", goal: "اسأل عن مواعيد العمل يوم الجمعة واشكرهم", callingOwner: false, languageHint: "اتصل واسأل عن المواعيد", callId }).catch((e) => ({ err: (e as Error).message })));
console.log("CALL_ID", callId);
