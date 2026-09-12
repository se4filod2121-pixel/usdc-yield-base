// Shared between CustomDepositPanel and CustomWithdrawPanel: both wrap
// OnchainKit's <Transaction> the same way (a "taking a while" watchdog plus
// friendly, localized error text), so this stays in one place.

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  insufficient: {
    tr: "Yetersiz bakiye. Lütfen daha düşük bir miktar girin.",
    en: "Insufficient balance. Please enter a smaller amount.",
    es: "Saldo insuficiente. Por favor ingrese un monto menor.",
    de: "Unzureichendes Guthaben. Bitte geben Sie einen kleineren Betrag ein.",
    fr: "Solde insuffisant. Veuillez saisir un montant plus faible.",
    pt: "Saldo insuficiente. Insira um valor menor.",
  },
  rejected: {
    tr: "İşlem cüzdanınızda onaylanmadı.",
    en: "Transaction was not approved in your wallet.",
    es: "La transacción no fue aprobada en tu billetera.",
    de: "Die Transaktion wurde in Ihrer Wallet nicht genehmigt.",
    fr: "La transaction n'a pas été approuvée dans votre portefeuille.",
    pt: "A transação não foi aprovada na sua carteira.",
  },
  network: {
    tr: "Ağ hatası. Cüzdanınızın Base ağında olduğundan emin olun.",
    en: "Network error. Make sure your wallet is on the Base network.",
    es: "Error de red. Asegúrate de que tu billetera esté en la red Base.",
    de: "Netzwerkfehler. Stellen Sie sicher, dass Ihre Wallet im Base-Netzwerk ist.",
    fr: "Erreur réseau. Assurez-vous que votre portefeuille est sur le réseau Base.",
    pt: "Erro de rede. Verifique se sua carteira está na rede Base.",
  },
  reverted: {
    tr: "İşlem zincir tarafından reddedildi. Lütfen miktarı kontrol edip tekrar deneyin.",
    en: "Transaction was rejected on-chain. Please check the amount and try again.",
    es: "La transacción fue rechazada en la cadena. Verifica el monto e intenta de nuevo.",
    de: "Transaktion wurde on-chain abgelehnt. Bitte überprüfen Sie den Betrag und versuchen Sie es erneut.",
    fr: "La transaction a été rejetée sur la chaîne. Vérifiez le montant et réessayez.",
    pt: "A transação foi rejeitada na blockchain. Verifique o valor e tente novamente.",
  },
  generic: {
    tr: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    en: "Something went wrong. Please try again.",
    es: "Algo salió mal. Por favor intenta de nuevo.",
    de: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    fr: "Une erreur s'est produite. Veuillez réessayer.",
    pt: "Algo deu errado. Tente novamente.",
  },
  timeout: {
    tr: "İşlem cüzdanınızdan çok uzun sürdü. Cüzdan uygulamanızı kontrol edin ve tekrar deneyin.",
    en: "This is taking longer than expected. Check your wallet app and try again.",
    es: "Esto está tardando más de lo esperado. Revisa tu billetera e intenta de nuevo.",
    de: "Dies dauert länger als erwartet. Überprüfen Sie Ihre Wallet-App und versuchen Sie es erneut.",
    fr: "Cela prend plus de temps que prévu. Vérifiez votre portefeuille et réessayez.",
    pt: "Isso está demorando mais do que o esperado. Verifique seu aplicativo de carteira e tente novamente.",
  },
};

function getUserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language?.split("-")[0]?.toLowerCase() || "en";
  return ["tr", "en", "es", "de", "fr", "pt"].includes(lang) ? lang : "en";
}

export function localizedMessage(key: keyof typeof ERROR_MESSAGES): string {
  const locale = getUserLocale();
  return ERROR_MESSAGES[key][locale] || ERROR_MESSAGES[key]["en"];
}

export function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  let key: keyof typeof ERROR_MESSAGES = "generic";
  if (msg.includes("insufficient") || msg.includes("exceeds balance")) key = "insufficient";
  else if (msg.includes("user rejected") || msg.includes("denied")) key = "rejected";
  else if (msg.includes("network") || msg.includes("chain")) key = "network";
  else if (msg.includes("execution reverted")) key = "reverted";
  return localizedMessage(key);
}

// The OnchainKit <Transaction> component has no built-in timeout, so on a
// slow wallet round-trip its button just spins forever with no feedback.
// After this long we tell the user it's taking a while — but callers should
// NOT remount/abandon the transaction on their own: a real confirmation can
// still arrive well past this mark (mobile wallet hand-offs are slow), and
// tearing down the listener would silently drop that success.
export const PENDING_TIMEOUT_MS = 40_000;
export const PENDING_STATUS_NAMES = new Set([
  "buildingTransaction",
  "transactionPending",
  "transactionLegacyExecuted",
]);
