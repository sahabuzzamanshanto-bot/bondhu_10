// =====================================================
// প্রতিদিন একবার চলে (GitHub Actions দিয়ে শিডিউল করা) —
// Firestore চেক করে দেখে কার আগামীকাল কিস্তি/ফেরতের দিন,
// আর সেভ করা সব ডিভাইস টোকেনে পুশ নোটিফিকেশন পাঠায়।
// =====================================================

const admin = require("firebase-admin");

function getBDDateStr(date = new Date()) {
    // বাংলাদেশ সময় (Asia/Dhaka) অনুযায়ী আজকের তারিখ, রানারের টাইমজোন যাই হোক না কেন
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(date);
}

function addDaysToDateStr(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

function addMonthsToDateStr(dateStr, months) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
}

// অ্যাপের computeNextInstallmentDate ফাংশনের হুবহু কপি — যেন একই হিসাব হয়
function computeNextInstallmentDate(disbursementDate, today) {
    if (!disbursementDate) return null;
    let candidate = addMonthsToDateStr(disbursementDate, 1);
    let guard = 0;
    while (candidate < today && guard < 600) {
        candidate = addMonthsToDateStr(candidate, 1);
        guard++;
    }
    return candidate;
}

async function main() {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();

    const today = getBDDateStr();
    const tomorrow = addDaysToDateStr(today, 1);
    console.log(`আজ: ${today}, আগামীকাল: ${tomorrow}`);

    const customersSnap = await db.collection("customers").get();
    const dueTomorrow = [];
    const repayTomorrow = [];

    customersSnap.forEach((docSnap) => {
        const c = docSnap.data();
        if (c.dueDate && computeNextInstallmentDate(c.dueDate, today) === tomorrow) {
            dueTomorrow.push(c);
        }
        if (c.repayDate === tomorrow) {
            repayTomorrow.push(c);
        }
    });

    if (dueTomorrow.length === 0 && repayTomorrow.length === 0) {
        console.log("আগামীকাল কোনো কিস্তি/ফেরতের রিমাইন্ডার নেই — পুশ পাঠানো হচ্ছে না।");
        return;
    }

    const tokensSnap = await db.collection("deviceTokens").get();
    const tokens = tokensSnap.docs.map((d) => d.id);

    if (tokens.length === 0) {
        console.log("কোনো ডিভাইস টোকেন সেভ নেই — অ্যাপ থেকে 'নোটিফিকেশন চালু করুন' চাপা হয়নি।");
        return;
    }

    const bodyLines = [];
    if (dueTomorrow.length > 0) {
        bodyLines.push(`🔔 কিস্তির দিন (${dueTomorrow.length} জন): ${dueTomorrow.map((c) => c.name).join(", ")}`);
    }
    if (repayTomorrow.length > 0) {
        bodyLines.push(`💰 ফেরতের দিন (${repayTomorrow.length} জন): ${repayTomorrow.map((c) => c.name).join(", ")}`);
    }

    const message = {
        notification: {
            title: "🔔 আগামীকালের রিমাইন্ডার",
            body: bodyLines.join("\n")
        },
        tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`পাঠানো হয়েছে — সফল: ${response.successCount}, ব্যর্থ: ${response.failureCount}`);

    // পুরনো/অকেজো (আনইনস্টল হওয়া) টোকেন মুছে ফেলা
    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
        if (!res.success) {
            const code = res.error && res.error.code;
            if (
                code === "messaging/invalid-registration-token" ||
                code === "messaging/registration-token-not-registered"
            ) {
                invalidTokens.push(tokens[idx]);
            }
        }
    });
    for (const t of invalidTokens) {
        await db.collection("deviceTokens").doc(t).delete().catch(() => {});
    }
    if (invalidTokens.length) console.log(`${invalidTokens.length}টি পুরনো টোকেন মুছে ফেলা হয়েছে।`);
}

main().catch((err) => {
    console.error("রিমাইন্ডার পাঠাতে সমস্যা হয়েছে:", err);
    process.exit(1);
});
