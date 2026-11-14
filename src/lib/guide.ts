export interface Tip {
  id: string
  ar: { title: string; body: string[] }
  en: { title: string; body: string[] }
}

// Educational content, not personal advice. Tax facts are general and can change.
export const TIPS: Tip[] = [
  {
    id: 'irish',
    ar: {
      title: 'الصناديق الأيرلندية (UCITS) للسوق الأمريكي',
      body: [
        'إذا كنت غير أمريكي وتستثمر في السوق الأمريكي عبر صندوق مؤشر، فنسخة الصندوق المسجلة في أيرلندا لنفس المؤشر غالبًا أوفر من النسخة الأمريكية:',
        '• التوزيعات: الصندوق الأمريكي يُستقطع من توزيعاته 30% لمستثمر من دولة بلا اتفاقية ضريبية مع أمريكا. الصندوق الأيرلندي يدفع 15% فقط على مستوى الصندوق بموجب اتفاقية أيرلندا–أمريكا.',
        '• ضريبة التركات الأمريكية: الأصول الأمريكية المقر (ومنها الصناديق الأمريكية) لغير المقيم قد تخضع لضريبة تركات تصل 40% فوق 60 ألف دولار. الصندوق الأيرلندي ليس أصلًا أمريكي المقر.',
        '• الفئات التراكمية (Acc): تعيد استثمار التوزيعات داخل الصندوق تلقائيًا، فلا نقد عاطل ولا عمولات إعادة شراء.',
        'أمثلة (مدرجة في لندن بالدولار): متوافقة شرعيًا: ISDU (أمريكا)، ISDW (العالم)، ISDE (الناشئة). تقليدية: CSPX و VUAA (S&P 500)، VWRA (كل العالم)، IWDA (العالم المتقدم).',
        'قبل الشراء: تأكد من الرمز والعملة لدى وسيطك، ومن أن وسيطك يتيح بورصة لندن، وراجع مختصًا ضريبيًا في حالتك.',
      ],
    },
    en: {
      title: 'Irish-domiciled (UCITS) funds for the US market',
      body: [
        'If you are not a US person and invest in the US market through an index fund, the Ireland-domiciled version of the same index is often cheaper to hold than the US one:',
        '• Dividends: a US fund withholds 30% on distributions to an investor from a country with no US tax treaty. An Irish fund pays only 15% at fund level under the Ireland–US treaty.',
        '• US estate tax: US-situs assets (including US funds) held by a non-resident can face estate tax of up to 40% above USD 60,000. An Irish fund is not a US-situs asset.',
        '• Accumulating (Acc) classes reinvest dividends inside the fund automatically — no idle cash, no repurchase fees.',
        'Examples (London-listed, in USD): Shariah-compliant: ISDU (USA), ISDW (World), ISDE (Emerging). Conventional: CSPX and VUAA (S&P 500), VWRA (All-World), IWDA (Developed World).',
        'Before buying: confirm the ticker and currency with your broker, check that your broker offers the London exchange, and ask a tax adviser about your own case.',
      ],
    },
  },
  {
    id: 'emergency',
    ar: { title: 'الطوارئ أولاً، ثم الاستثمار', body: ['بدون صندوق طوارئ ستضطر لبيع استثماراتك في أسوأ وقت: عند فقد دخل أو مصروف مفاجئ يتزامن غالبًا مع هبوط السوق.', 'ضعه في وعاء سائل لا يتقلب (حساب ادخار أو صندوق مرابحة)، ولا تحسبه ضمن أرباحك.'] },
    en: { title: 'Emergency fund first, then invest', body: ['Without one you end up selling investments at the worst time: a lost income or surprise bill often coincides with a market drop.', 'Keep it somewhere liquid that does not swing (savings account or money-market fund), and do not count it as investment performance.'] },
  },
  {
    id: 'employer',
    ar: { title: 'مساهمة جهة العمل عائد لا يتكرر', body: ['إن كانت جهة عملك تضيف نسبة على ادخارك، فهذه النسبة عائد فوري قبل أي عائد سوقي.', 'اشترك بالحد الذي يمنحك المساهمة كاملة، وانتبه لشروط الاستحقاق (سنوات الخدمة) قبل ترك العمل.'] },
    en: { title: 'The employer match is a one-of-a-kind return', body: ['If your employer adds to what you save, that addition is an instant return before any market return.', 'Contribute enough to get the full match, and check the vesting terms (years of service) before leaving.'] },
  },
  {
    id: 'dca',
    ar: { title: 'الانتظام يغلب التوقيت', body: ['استثمار مبلغ ثابت كل شهر يشتري أكثر حين تنخفض الأسعار وأقل حين ترتفع، ويعفيك من قرار «هل الوقت مناسب؟».', 'اجعل التحويل آليًا بعد الراتب مباشرة.'] },
    en: { title: 'Consistency beats timing', body: ['Investing a fixed amount each month buys more when prices fall and less when they rise, and spares you the “is now the right time?” decision.', 'Automate the transfer right after payday.'] },
  },
  {
    id: 'fees',
    ar: { title: 'الرسوم تتراكم مثل العائد', body: ['فرق 1% في الرسوم السنوية على مدى 25 سنة قد يأكل نحو خُمس محفظتك النهائية.', 'قارن نسبة المصاريف الإجمالية (TER) ورسوم الاشتراك والحفظ قبل اختيار صندوق أو منصة.'] },
    en: { title: 'Fees compound just like returns', body: ['A 1% difference in annual fees over 25 years can eat roughly a fifth of your final portfolio.', 'Compare the total expense ratio (TER), subscription and custody fees before choosing a fund or platform.'] },
  },
  {
    id: 'diversify',
    ar: { title: 'التنويع والانحياز المحلي', body: ['راتبك وعقارك وأسهمك المحلية تعتمد كلها على اقتصاد واحد. التعرض العالمي يخفف هذا الارتباط.', 'التنويع الحقيقي على محاور: فئة الأصل، الجغرافيا، القطاع، والجهة الحافظة — راجعها في «التحليل».'] },
    en: { title: 'Diversification and home bias', body: ['Your salary, property and local shares all depend on one economy. Global exposure loosens that link.', 'Real diversification runs along several axes: asset class, geography, sector and custodian — see them under Analysis.'] },
  },
  {
    id: 'rebalance',
    ar: { title: 'أعد التوازن بالمساهمات قبل البيع', body: ['حين تنحرف المحفظة عن المستهدف، وجّه المال الجديد للفئة الناقصة بدل بيع الرابحة.', 'البيع يبقى خيارًا عند انحراف كبير (أكثر من 5 نقاط) لا تكفي المساهمات لإصلاحه.'] },
    en: { title: 'Rebalance with contributions before selling', body: ['When the portfolio drifts from target, send new money to the underweight class instead of selling the winner.', 'Selling remains an option for a large drift (over 5 points) that contributions cannot fix.'] },
  },
  {
    id: 'peg',
    ar: { title: 'ربط الريال بالدولار', body: ['الريال مربوط بالدولار منذ عقود، فالأصول الدولارية لا تحمل خطر صرف يُذكر ما دام الربط قائمًا.', 'الأصول بعملات أخرى (يورو، جنيه) تضيف تقلب سعر الصرف فوق تقلب الأصل نفسه.'] },
    en: { title: 'The riyal–dollar peg', body: ['The riyal has been pegged to the dollar for decades, so dollar assets carry little currency risk while the peg holds.', 'Assets in other currencies (euro, pound) add exchange-rate swings on top of the asset’s own.'] },
  },
  {
    id: 'shariah',
    ar: { title: 'التوافق الشرعي والتطهير', body: ['قوائم الأسهم المتوافقة تختلف بين الهيئات الشرعية وتتغير كل ربع سنة مع القوائم المالية.', 'الصناديق الموسومة «متوافق شرعيًا» في التطبيق هي ما يسوّقه مُصدرها كذلك؛ تحقق من الهيئة الشرعية التي تثق بها ومن نسبة التطهير إن وُجدت.'] },
    en: { title: 'Shariah compliance and purification', body: ['Lists of compliant shares differ between Shariah boards and change each quarter with the financial statements.', 'Funds tagged “Shariah” in the app are those marketed as such by their issuer; check with the board you trust and for any purification ratio.'] },
  },
]
