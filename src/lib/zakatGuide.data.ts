// Zakat guidance per asset class with sources (owned by the research agent; see CATALOG-SOURCES.md, section «دليل الزكاة»).
// The default `method` is the common view for a LONG-TERM investor; `alternatives` are other accepted approaches the owner may pick.
// Researched 2026-11-08. Neutral by design: the app presents these as options, not fatwas.
import type { AssetClass, ZakatMethod } from './catalog'

export interface ZakatGuide {
  /** the default method the app applies for this class */
  method: ZakatMethod
  /** % of value that is zakatable when method = 'zakatable_assets' */
  ratio: number | null
  /** short plain Arabic explanation (2–3 lines max) */
  text: string
  /** other accepted approaches the owner may choose, with one line each */
  alternatives: Array<{ method: ZakatMethod; ratio: number | null; text: string }>
  sources: Array<{ title: string; url: string }>
}

const CHECK = 'للتأكد راجع جهة شرعية موثوقة.'

const SRC = {
  aaoifi35: { title: 'أيوفي: المعيار الشرعي رقم 35 (الزكاة) — النص الكامل للأعضاء والمشتركين', url: 'https://cis.aaoifi.com/standards/ss-35-zakah/' },
  iifa28: { title: 'مجمع الفقه الإسلامي الدولي: القرار 28 (3/4) بشأن زكاة أسهم الشركات (1408هـ)', url: 'https://iifa-aifi.org/en/32294.html' },
  iifa121: { title: 'مجمع الفقه الإسلامي الدولي: القرار 121 (3/13) بشأن زكاة الأسهم المقتناة للاستفادة من ريعها (1422هـ)', url: 'https://iifa-aifi.org/en/32840.html' },
  iifa2: { title: 'مجمع الفقه الإسلامي الدولي: القرار 2 (2/2) بشأن زكاة العقارات والأراضي المأجورة غير الزراعية (1406هـ)', url: 'https://iifa-aifi.org/en/32196.html' },
  iifa143: { title: 'مجمع الفقه الإسلامي الدولي: القرار 143 (1/16) بشأن زكاة الحسابات المقيدة ومكافآت نهاية الخدمة وصناديق الادخار (1426هـ)', url: 'https://iifa-aifi.org/en/32897.html' },
  zatcaRegs: { title: 'هيئة الزكاة والضريبة والجمارك: اللائحة التنفيذية لجباية الزكاة 1445هـ (المادة 3: الخاضعون للجباية)', url: 'https://zatca.gov.sa/en/RulesRegulations/Documents/ZAKAT%20COLLECTION.pdf' },
  zatcaGov: { title: 'هيئة الزكاة والضريبة والجمارك: ضوابط تحمّل الدولة الزكاة وضريبة الدخل عن الاستثمار في الصكوك الحكومية (قرار وزير المالية 2218 لعام 1440هـ وتعديلاته)', url: 'https://zatca.gov.sa/ar/RulesRegulations/Taxes/Pages/GovernmentInstruments.aspx' },
  fundRules: { title: 'KPMG: قواعد جباية الزكاة من المستثمرين في الصناديق الاستثمارية (نافذة من 2023): الصندوق لا يدفع والزكاة على مالك الوحدات', url: 'https://home.kpmg/sa/en/home/insights/2022/12/tax-alert-zakat-rules-for-invesrments-in-investment-funds.html' },
  fundDisclosure: { title: 'الإنماء المالية: الإفصاح السنوي عن «الزكاة لكل وحدة» لصناديقها (مثال على إفصاحات مديري الصناديق)', url: 'https://alinmacapital.com/-/media/Project/Alinma/PDF/Aug-2026/Annual-Zakat-Disclosure-for-Investment-Funds-for-the-Year-2024.pdf' },
  nzf: { title: 'National Zakat Foundation: نسبة تقديرية 25% للأسهم طويلة الأجل استناداً إلى معيار أيوفي 35', url: 'https://nzf.org.uk/knowledge/zakat-on-share-investments-determining-a-proxy-for-calculation/' },
  iq69912: { title: 'الإسلام سؤال وجواب 69912: تفصيل القول في زكاة الأسهم (اللجنة الدائمة 9/341، ابن عثيمين)', url: 'https://islamqa.info/ar/answers/69912' },
  iq131229: { title: 'الإسلام سؤال وجواب 131229: زكاة الصكوك المقتناة للمتاجرة أو للربح', url: 'https://islamqa.info/ar/answers/131229' },
  iq542990: { title: 'الإسلام سؤال وجواب 542990: كيف تُزكّى صكوك المرابحة (الأصل والربح كل سنة)', url: 'https://islamqa.info/ar/answers/542990' },
  iq301305: { title: 'الإسلام سؤال وجواب 301305: زكاة صندوق الادخار الذي يُمنع السحب منه', url: 'https://islamqa.info/ar/answers/301305' },
  iq145770: { title: 'الإسلام سؤال وجواب 145770: الزكاة واجبة في جميع أنواع الذهب إذا بلغ النصاب', url: 'https://islamqa.info/ar/answers/145770' },
  aaoifi57: { title: 'ملخص المعيار الشرعي 57 لأيوفي (الذهب): وحدات الصناديق التي كل أصولها ذهب لها حكم الذهب (Amal Invest)', url: 'https://amalinvest.com/halal-investing/is-gold-etf-halal' },
  sah: { title: 'أرقام: تفاصيل منتج «صح» الادخاري (مدة سنة، العائد عند الاستحقاق، الاسترداد المبكر)', url: 'https://www.argaam.com/en/article/articledetail/id/1702090' },
}

/** Long-term holdings of foreign shares and equity ETFs (shared by the three foreign equity classes). */
const FOREIGN_EQUITY: ZakatGuide = {
  method: 'zakatable_assets',
  ratio: 25,
  text: `للمستثمر طويل الأجل: الزكاة 2.5% على الجزء الزكوي من أصول الشركات (النقد والذمم والمخزون)، ويُقدّر عند تعذّر حسابه بربع القيمة السوقية، فيكون الواجب نحو 0.625% من القيمة. وتُضم التوزيعات المقبوضة إلى نقدك. ${CHECK}`,
  alternatives: [
    { method: 'market', ratio: null, text: 'نية المتاجرة (البيع عند الارتفاع): 2.5% من القيمة السوقية كاملة (قرار المجمع 28 (3/4)).' },
    { method: 'zakatable_assets', ratio: null, text: 'احسب النسبة الزكوية الفعلية من قوائم الشركات أو الصندوق إن تيسّر ذلك (قرار المجمع 121 (3/13)).' },
    { method: 'income_only', ratio: null, text: 'إن تعذّرت معرفة الموجودات الزكوية واقتنيت السهم للريع: الزكاة على الأرباح الموزعة بعد حولها (قرار المجمع 28 (3/4)).' },
  ],
  sources: [SRC.aaoifi35, SRC.nzf, SRC.iifa28, SRC.iifa121],
}

const SUKUK_IJARA_ALT = {
  method: 'income_only' as const,
  ratio: null,
  text: 'صكوك قائمة على أعيان مؤجرة (إجارة) اقتنيتها للعائد لا للبيع: يرى بعض أهل العلم أن الزكاة على الربح المقبوض فقط.',
}

export const ZAKAT_GUIDE: Record<AssetClass, ZakatGuide> = {
  cash: {
    method: 'market',
    ratio: null,
    text: 'النقد في الحسابات تجب فيه الزكاة 2.5% من رصيده يوم زكاتك، إذا بلغ مالك الزكوي النصاب وحال عليه الحول الهجري. ويُضم إلى بقية أموالك الزكوية.',
    alternatives: [],
    sources: [SRC.iifa143, SRC.aaoifi35],
  },
  money_market: {
    method: 'market',
    ratio: null,
    text: 'وحدات صناديق أسواق النقد والمرابحة تمثل نقداً وديوناً قصيرة الأجل، فتُزكّى كل حول 2.5% من قيمتها يوم الزكاة (الأصل مع الربح). والصندوق لا يدفع الزكاة عنك.',
    alternatives: [
      { method: 'zakatable_assets', ratio: null, text: 'إن نشر مدير الصندوق «الزكاة لكل وحدة» في إفصاحه السنوي فيمكنك اعتماده بدل الحساب على القيمة كاملة.' },
    ],
    sources: [SRC.iq542990, SRC.iifa143, SRC.fundRules, SRC.fundDisclosure],
  },
  savings_sukuk: {
    method: 'market',
    ratio: null,
    text: 'صكوك «صح» دين لك على الحكومة بعائد ثابت، فتُزكّى كل حول 2.5% من قيمتها (المبلغ المدّخر مع ما تحقق من عائد). وتحمّل الدولة للزكاة عن الصكوك الحكومية يخص ما تجبيه الهيئة من المكلفين، ولم تذكر ضوابطه المنشورة الأفراد.',
    alternatives: [],
    sources: [SRC.sah, SRC.iq542990, SRC.zatcaGov, SRC.iifa143],
  },
  murabaha: {
    method: 'market',
    ratio: null,
    text: 'الوديعة أو المرابحة البنكية مال لك في ذمة البنك تقدر على استرداده، فتُزكّى كل حول 2.5% من رصيدها مع أرباحها (قرار المجمع 143 (1/16) في الحسابات الاستثمارية).',
    alternatives: [],
    sources: [SRC.iifa143, SRC.iq542990],
  },
  sukuk_sar: {
    method: 'market',
    ratio: null,
    text: `الرأي الشائع: تُزكّى الصكوك وصناديقها كل حول 2.5% من قيمتها السوقية مع الأرباح المقبوضة، لأن أغلبها نقود أو ديون مثل صكوك المرابحة. والصندوق لا يدفع الزكاة عنك، وتحمّل الدولة للزكاة عن الصكوك الحكومية خاص بما تجبيه الهيئة من المكلفين. ${CHECK}`,
    alternatives: [
      SUKUK_IJARA_ALT,
      { method: 'zakatable_assets', ratio: null, text: 'صناديق الصكوك السعودية: يمكنك اعتماد «الزكاة لكل وحدة» التي ينشرها مدير الصندوق سنوياً.' },
    ],
    sources: [SRC.iq542990, SRC.iq131229, SRC.iifa28, SRC.zatcaGov, SRC.fundRules],
  },
  sukuk_usd: {
    method: 'market',
    ratio: null,
    text: `الرأي الشائع: تُزكّى الصكوك الدولارية وصناديقها كل حول 2.5% من قيمتها السوقية مع الأرباح المقبوضة، لأن أغلبها نقود أو ديون. والصندوق المتداول لا يدفع الزكاة عنك. ${CHECK}`,
    alternatives: [SUKUK_IJARA_ALT],
    sources: [SRC.iq542990, SRC.iq131229, SRC.iifa28, SRC.aaoifi35],
  },
  equity_global: FOREIGN_EQUITY,
  equity_us: FOREIGN_EQUITY,
  equity_em: FOREIGN_EQUITY,
  equity_sa: {
    method: 'paid_by_entity',
    ratio: null,
    text: 'الشركات السعودية المدرجة تدفع الزكاة للهيئة نظاماً عن حصص مساهميها، ودفعها بإلزام النظام يكفي المستثمر طويل الأجل (قرار المجمع 28 (3/4) وفتوى اللجنة الدائمة). وصناديق الأسهم لا تدفع عنك، لكن الشركات التي تملكها تدفع، ويبقى نقد الصندوق.',
    alternatives: [
      { method: 'market', ratio: null, text: 'نية المتاجرة: 2.5% من القيمة السوقية كاملة (قرار المجمع 28 (3/4)).' },
      { method: 'zakatable_assets', ratio: null, text: 'صناديق الأسهم السعودية: اعتمد «الزكاة لكل وحدة» التي ينشرها مدير الصندوق سنوياً.' },
    ],
    sources: [SRC.zatcaRegs, SRC.iifa28, SRC.iq69912, SRC.fundRules, SRC.fundDisclosure],
  },
  equity_direct: {
    method: 'paid_by_entity',
    ratio: null,
    text: `الأسهم السعودية المقتناة للاستثمار تدفع شركاتها الزكاة نظاماً فيكفي ذلك على الرأي الشائع. والأسهم الأجنبية المقتناة للاستثمار تُزكّى على ربع قيمتها تقديراً، وما كان للمتاجرة يُزكّى على قيمته السوقية كاملة. ${CHECK}`,
    alternatives: [
      { method: 'zakatable_assets', ratio: 25, text: 'أسهم أجنبية طويلة الأجل: 2.5% من ربع القيمة السوقية (تقدير مؤسسة الزكاة الوطنية البريطانية).' },
      { method: 'market', ratio: null, text: 'نية المتاجرة: 2.5% من القيمة السوقية كاملة.' },
    ],
    sources: [SRC.zatcaRegs, SRC.iifa28, SRC.iq69912, SRC.nzf],
  },
  reit_sa: {
    method: 'income_only',
    ratio: null,
    text: `صناديق الريت تملك عقارات مؤجرة، والعقار المؤجر لا زكاة في أصله بل في غلّته (قرار المجمع 2 (2/2))، فيزكي المستثمر طويل الأجل التوزيعات المقبوضة إذا حال عليها الحول. والصندوق لا يدفع الزكاة عنك. ${CHECK}`,
    alternatives: [
      { method: 'market', ratio: null, text: 'نية المتاجرة بالوحدات: 2.5% من قيمتها السوقية.' },
      { method: 'zakatable_assets', ratio: null, text: 'اعتمد «الزكاة لكل وحدة» التي ينشرها مدير الصندوق سنوياً، وتشمل نقد الصندوق وذممه.' },
    ],
    sources: [SRC.iifa2, SRC.iifa28, SRC.fundRules, SRC.fundDisclosure],
  },
  reit_global: {
    method: 'income_only',
    ratio: null,
    text: `صناديق الريت العالمية تملك عقارات مؤجرة، والعقار المؤجر لا زكاة في أصله بل في غلّته (قرار المجمع 2 (2/2))، فيزكي المستثمر طويل الأجل التوزيعات المقبوضة إذا حال عليها الحول. ${CHECK}`,
    alternatives: [
      { method: 'market', ratio: null, text: 'نية المتاجرة بالوحدات: 2.5% من قيمتها السوقية.' },
      { method: 'zakatable_assets', ratio: null, text: 'احسب الجزء الزكوي (النقد والذمم) من قوائم الصندوق إن تيسّر ذلك.' },
    ],
    sources: [SRC.iifa2, SRC.iifa28, SRC.aaoifi35],
  },
  gold: {
    method: 'market',
    ratio: null,
    text: 'الذهب تجب زكاته كل حول 2.5% من قيمته السوقية إذا بلغ النصاب وحده أو مع بقية مالك، ولا تُشترط فيه نية المتاجرة. ووحدات صناديق الذهب المغطاة بذهب مخصص لها حكم الذهب نفسه.',
    alternatives: [],
    sources: [SRC.iq145770, SRC.aaoifi57],
  },
  mixed_income: {
    method: 'market',
    ratio: null,
    text: `صناديق الدخل المتنوعة تجمع أسهماً وريتات وصكوكاً ومرابحة، والأحوط تزكية قيمتها كاملة 2.5% كل حول. وللدقة يُزكّى كل جزء بحكمه: النقد والصكوك على القيمة، والريت على الغلة، والأسهم السعودية تزكيها شركاتها. ${CHECK}`,
    alternatives: [
      { method: 'zakatable_assets', ratio: null, text: 'اعتمد «الزكاة لكل وحدة» التي ينشرها مدير الصندوق سنوياً، أو النسبة الزكوية من مكوّناته في آخر نشرة.' },
    ],
    sources: [SRC.fundRules, SRC.fundDisclosure, SRC.iifa2, SRC.iifa28],
  },
  other: {
    method: 'market',
    ratio: null,
    text: `الأصول الاستثمارية الأخرى تُزكّى قيمتها 2.5% كل حول. وبرامج الادخار الوظيفية التي لا تملك سحبها ولا التصرف فيها لا زكاة فيها حتى تقبضها، ثم تزكيها عن سنة واحدة (قرار المجمع 143 (1/16))، ويرى بعض أهل الفتوى أن ما تقتطعه أنت من راتبك يُزكّى كل حول. ${CHECK}`,
    alternatives: [
      { method: 'exempt', ratio: null, text: 'برنامج ادخار مقفل لا تملك سحبه: لا زكاة حتى القبض، ثم زكاة سنة واحدة (قرار المجمع 143 (1/16)).' },
    ],
    sources: [SRC.iifa143, SRC.iq301305, SRC.aaoifi35],
  },
}
