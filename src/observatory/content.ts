import type { Waypoint } from '../Globe';

export type Lang = 'en' | 'ar';
export type ExperienceId = 'ocean' | 'forest' | 'sky' | 'ice';

export type Experience = {
  id: ExperienceId;
  index: string;
  waypoint: Waypoint;
  sources: { label: string; href: string }[];
};

export const EXPERIENCES: Experience[] = [
  {
    id: 'ocean', index: '01',
    waypoint: { id: 'monterey', name: 'Monterey Bay', lat: 36.8, lon: -121.9, region: 'North Pacific' },
    sources: [
      { label: 'NASA PO.DAAC — OSCAR surface currents', href: 'https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_FINAL_V2.0' },
    ],
  },
  {
    id: 'forest', index: '02',
    waypoint: { id: 'amazon', name: 'Amazon Basin', lat: -3.4653, lon: -62.2159, region: 'South America' },
    sources: [
      { label: 'NASA GEDI — forest structure lidar', href: 'https://gedi.umd.edu/' },
      { label: 'NASA Earthdata — GEDI mission', href: 'https://www.earthdata.nasa.gov/data/instruments/gedi' },
    ],
  },
  {
    id: 'sky', index: '03',
    waypoint: { id: 'congo', name: 'Congo Basin', lat: -0.228, lon: 15.8277, region: 'Central Africa' },
    sources: [
      { label: 'NASA GHRC — Lightning Imaging Sensor (LIS)', href: 'https://ghrc.nsstc.nasa.gov/lightning/' },
    ],
  },
  {
    id: 'ice', index: '04',
    waypoint: { id: 'svalbard', name: 'Svalbard', lat: 78.2232, lon: 15.6469, region: 'Arctic Ocean' },
    sources: [
      { label: 'NSIDC — Arctic Sea Ice News & Analysis', href: 'https://nsidc.org/arcticseaicenews/' },
      { label: 'NASA Earth Observatory — Sea Ice', href: 'https://earthobservatory.nasa.gov/features/SeaIce' },
    ],
  },
];

type ExpCopy = { name: string; category: string; place: string; region: string; summary: string; listen: string; why: string };

export const EXP_COPY: Record<Lang, Record<ExperienceId, ExpCopy>> = {
  en: {
    ocean: { name: 'The Living Ocean', category: 'Estimated surface currents', place: 'Monterey Bay', region: 'North Pacific',
      summary: 'Explore estimated daily-average surface currents from NASA OSCAR for all 30 days of November 2023.',
      listen: 'Regional currents shape the existing Deep Ocean, Hybrid and Orchestral musical interpretations.',
      why: 'Monterey Bay is an illustrative region: a well-studied coastal upwelling zone in the California Current.' },
    forest: { name: 'The Breathing Forest', category: 'Forest canopy height', place: 'Amazon Basin', region: 'South America',
      summary: 'Spaceborne lidar measures the vertical structure of forests — how tall the canopy stands and how layered it is beneath.',
      listen: 'Planned: canopy height could map to register, layering to texture.',
      why: 'The Amazon Basin is an illustrative region: the largest continuous tropical forest on Earth.' },
    sky: { name: 'The Electric Sky', category: 'Lightning observations', place: 'Congo Basin', region: 'Central Africa',
      summary: 'Optical sensors in orbit detect brief flashes of lightning day and night, building a long record of where storms concentrate.',
      listen: 'Planned: flash density could map to rhythmic density.',
      why: 'The Congo Basin is an illustrative region: one of the most lightning-active areas observed from space.' },
    ice: { name: 'The Frozen Earth', category: 'Polar · Arctic sea ice', place: 'Svalbard', region: 'Arctic Ocean',
      summary: 'Passive-microwave satellites have tracked Arctic sea-ice extent since 1979, showing its seasonal growth and retreat.',
      listen: 'Planned: ice extent could map to sustained tone and stereo width.',
      why: 'Svalbard is an illustrative region: an archipelago at the edge of the seasonal Arctic ice pack.' },
  },
  ar: {
    ocean: { name: 'المحيط الحي', category: 'تقديرات التيارات السطحية', place: 'خليج مونتيري', region: 'شمال المحيط الهادئ',
      summary: 'استكشف تقديرات متوسط التيارات السطحية اليومية من NASA OSCAR لجميع أيام نوفمبر ٢٠٢٣ الثلاثين.',
      listen: 'تشكّل التيارات الإقليمية التفسيرات الموسيقية: المحيط العميق والهجين والأوركسترالي.',
      why: 'خليج مونتيري منطقة توضيحية: منطقة ساحلية مدروسة جيداً لصعود المياه العميقة.' },
    forest: { name: 'الغابة التي تتنفس', category: 'ارتفاع ظلة الغابة', place: 'حوض الأمازون', region: 'أمريكا الجنوبية',
      summary: 'يقيس الليدار الفضائي البنية العمودية للغابات: ارتفاع الظلة وطبقاتها تحتها.',
      listen: 'مخطط: قد يُربط ارتفاع الظلة بالطبقة الصوتية والطبقات بالملمس.',
      why: 'حوض الأمازون منطقة توضيحية: أكبر غابة استوائية متصلة على الأرض.' },
    sky: { name: 'السماء الكهربائية', category: 'أرصاد البرق', place: 'حوض الكونغو', region: 'وسط أفريقيا',
      summary: 'ترصد مستشعرات بصرية في المدار ومضات البرق ليلاً ونهاراً، فتبني سجلاً طويلاً لأماكن تركّز العواصف.',
      listen: 'مخطط: قد تُربط كثافة الومضات بكثافة الإيقاع.',
      why: 'حوض الكونغو منطقة توضيحية: من أكثر المناطق نشاطاً بالبرق كما تُرى من الفضاء.' },
    ice: { name: 'الأرض المتجمدة', category: 'الجليد البحري القطبي', place: 'سفالبارد', region: 'المحيط المتجمد الشمالي',
      summary: 'تتابع أقمار الموجات الدقيقة امتداد الجليد البحري في القطب الشمالي منذ ١٩٧٩، مُظهرة نموه وتراجعه الموسمي.',
      listen: 'مخطط: قد يُربط امتداد الجليد بنغمة ممتدة وعرض الصوت المجسّم.',
      why: 'سفالبارد منطقة توضيحية: أرخبيل على حافة الجليد القطبي الموسمي.' },
  },
};

export const UI = {
  en: {
    skip: 'Skip to experiences',
    brandTag: 'Earth sound observatory',
    nav: { about: 'About', access: 'Accessibility' },
    navLabel: 'Primary',
    langSwitch: 'Switch language to Arabic', langShort: 'AR', langCurrent: 'EN',
    eyebrow: 'An interactive Earth sound observatory',
    h1a: 'Earth has a voice.', h1b: 'Discover its sound.',
    lead: "Explore Earth's changing systems through NASA visualizations, scientific sonification, and immersive soundscapes.",
    tagline: 'Listen beyond vision', skipIntro: 'Skip intro', introPreparing: 'Preparing NASA Blue Marble maps', introLabel: 'SONARA opening sequence',
    enterIntro: 'Enter SONARA', introReady: 'Live Earth ready',
    introWaiting: 'Starting the live 3D Earth', introFallback: '3D view unavailable. Enter to continue without it',
    introAlt: 'SONARA, Listen beyond vision: a sunlit Earth rising from the dark',
    begin: 'Begin Listening', explore: 'Explore the Earth',
    micro: 'See the data. Hear the planet.',
    navigator: 'Four experiences',
    preview: 'Preview',
    previewNote: 'Each experience is a preview. Datasets and audio are not yet connected.',
    panelIdle: 'Choose an experience',
    panelIdleBody: 'Select one of the four experiences, or a point on the globe, to bring its region into view.',
    experience: 'Experience', variable: 'Variable', region: 'Illustrative region', coords: 'Coordinates',
    status: 'Data status', statusValue: 'Preview — no dataset connected',
    audio: 'Audio mapping', sources: 'Scientific sources',
    listen: 'Listening availability', details: 'Explore details', hideDetails: 'Hide details', clear: 'Clear selection',
    mapPoint: 'Map selection', mapPointBody: 'A point you chose on the globe. No experience data is linked to arbitrary points yet.',
    lat: 'Lat', lon: 'Lon',
    drag: 'Drag to rotate', zoom: 'Scroll or use +/− to zoom',
    loading: 'Preparing NASA Blue Marble surface, cloud and city-light maps…',
    failedTitle: 'NASA Blue Marble maps could not be loaded.',
    failedBody: 'Check your connection and try again. No substitute globe maps are shown.',
    retry: 'Try again',
    unavailableTitle: 'The 3D Earth view is unavailable.',
    unavailableBody: 'SONARA could not start WebGL, the browser technology used for 3D. Try again, enable graphics acceleration in your browser settings, or use a WebGL-compatible browser.',
    contextLostTitle: 'The 3D Earth view was interrupted.',
    contextLostBody: 'Your browser lost its WebGL graphics context. Retry to rebuild the 3D view. If this continues, close other graphics-heavy tabs or restart your browser.',
    renderingAlternative: 'Experience selection remains available through the Experiences navigation. No substitute globe is shown.',
    retry3d: 'Retry 3D view',
    archival: 'Globe: NASA Blue Marble (2002) — historical, static imagery, not live.',
    globeRegion: 'Interactive Earth',
    selectedAnnounce: (n: string) => `${n} selected. Globe turning to its illustrative region.`,
    close: 'Close',
  },
  ar: {
    skip: 'انتقل إلى التجارب',
    brandTag: 'مرصد صوتي للأرض',
    nav: { about: 'عن المشروع', access: 'إمكانية الوصول' },
    navLabel: 'التنقل الرئيسي',
    langSwitch: 'التبديل إلى الإنجليزية', langShort: 'EN', langCurrent: 'ع',
    eyebrow: 'مرصد تفاعلي لأصوات الأرض',
    h1a: 'للأرض صوت.', h1b: 'اكتشف نغمتها.',
    lead: 'استكشف أنظمة الأرض المتغيرة عبر تصورات ناسا، والتحويل الصوتي الهادف للبيانات، ومشاهد صوتية غامرة.',
    tagline: 'استمع إلى ما وراء البصر', skipIntro: 'تخطي المقدمة', introPreparing: 'جارٍ تجهيز خرائط ناسا', introLabel: 'المشهد الافتتاحي لـ SONARA',
    enterIntro: 'ادخل إلى SONARA', introReady: 'الأرض الحية جاهزة',
    introWaiting: 'جارٍ تشغيل الأرض ثلاثية الأبعاد', introFallback: 'العرض ثلاثي الأبعاد غير متاح. ادخل للمتابعة دونه',
    introAlt: 'SONARA، استمع إلى ما وراء البصر: أرض مضاءة تشرق من الظلام',
    begin: 'ابدأ الاستماع', explore: 'استكشف الأرض',
    micro: 'شاهد البيانات. استمع إلى الكوكب.',
    navigator: 'أربع تجارب',
    preview: 'معاينة',
    previewNote: 'كل تجربة معاينة. البيانات والصوت غير متصلين بعد.',
    panelIdle: 'اختر تجربة',
    panelIdleBody: 'اختر إحدى التجارب الأربع أو نقطة على الكرة لعرض منطقتها.',
    experience: 'التجربة', variable: 'المتغير', region: 'منطقة توضيحية', coords: 'الإحداثيات',
    status: 'حالة البيانات', statusValue: 'معاينة — لا توجد بيانات متصلة',
    audio: 'الربط الصوتي', sources: 'المصادر العلمية',
    listen: 'توفر الاستماع', details: 'عرض التفاصيل', hideDetails: 'إخفاء التفاصيل', clear: 'إلغاء الاختيار',
    mapPoint: 'اختيار على الخريطة', mapPointBody: 'نقطة اخترتها على الكرة. لا ترتبط بيانات تجربة بالنقاط العشوائية بعد.',
    lat: 'عرض', lon: 'طول',
    drag: 'اسحب للتدوير', zoom: 'مرّر أو استخدم +/− للتكبير',
    loading: 'جارٍ تجهيز خرائط سطح الأرض والسحب وأضواء المدن من ناسا…',
    failedTitle: 'تعذّر تحميل خرائط ناسا لسطح الأرض.',
    failedBody: 'تحقق من الاتصال وحاول مجدداً. لن نعرض خرائط بديلة.',
    retry: 'إعادة المحاولة',
    unavailableTitle: 'العرض ثلاثي الأبعاد للأرض غير متاح.',
    unavailableBody: 'تعذّر على SONARA تشغيل WebGL، وهي تقنية المتصفح للعرض ثلاثي الأبعاد. حاول مجدداً، أو فعّل تسريع الرسومات، أو استخدم متصفحاً يدعم WebGL.',
    contextLostTitle: 'توقّف العرض ثلاثي الأبعاد للأرض.',
    contextLostBody: 'فقد المتصفح اتصال WebGL بمعالج الرسومات. أعد المحاولة لإنشاء العرض مجدداً.',
    renderingAlternative: 'يمكن اختيار التجارب من رابط التجارب في التنقل. لن نعرض كرة أرضية بديلة.',
    retry3d: 'إعادة تشغيل العرض ثلاثي الأبعاد',
    archival: 'الكرة: ناسا بلو ماربل (٢٠٠٢) — صور تاريخية ثابتة وليست مباشرة.',
    globeRegion: 'الأرض التفاعلية',
    selectedAnnounce: (n: string) => `تم اختيار ${n}. تدور الكرة نحو منطقتها التوضيحية.`,
    close: 'إغلاق',
  },
};

export type DialogKind = 'about' | 'access' | 'listen';

export const DIALOGS: Record<Lang, Record<DialogKind, { kicker: string; title: string; blocks: { h: string; p: string }[] }>> = {
  en: {
    about: { kicker: 'About', title: 'Earth data, heard', blocks: [
      { h: 'What SONARA does', p: 'SONARA transforms Earth observation data into sound, with the aim of making our planet’s data more accessible and engaging.' },
      { h: 'Available experience', p: 'The Electric Sky is currently available in Mission Control.' },
      { h: 'Lightning observations', p: 'The Electric Sky uses a processed extract of NASA ISS LIS lightning observations.' },
      { h: 'Sonification', p: 'Lightning observations are mapped into musical patterns through sonification. The generated sounds are a representation of data, not actual recordings of lightning.' },
      { h: 'Coming soon', p: 'The Living Ocean is available with November 2023 OSCAR surface currents and three musical interpretations. The Breathing Forest and The Frozen Earth are coming soon.' },
    ] },
    access: { kicker: 'Accessibility', title: 'Built to be explored without sight', blocks: [
      { h: 'Without the 3D globe', p: 'Choose an experience in Mission Control with a keyboard or screen reader. The globe is an optional visual companion; the lightning experience does not require WebGL.' },
      { h: 'Keyboard', p: 'Tab moves through links, actions and experience cards. Enter or Space activates buttons. Arrow keys adjust sliders and scientific explanation tabs. Escape closes this panel.' },
      { h: 'Announcements', p: 'Selecting an experience is announced, and the context panel updates with the region, variable and sources as text.' },
      { h: 'Language & motion', p: 'Switch between English and Arabic (right-to-left) from the header. Animations are reduced when your system requests reduced motion.' },
      { h: 'Sound', p: 'SONARA never plays sound before you ask. The Electric Sky includes play, pause, resume, stop, volume and mute controls.' },
    ] },
    listen: { kicker: 'Listening', title: 'Audio is not available yet', blocks: [
      { h: 'Honest status', p: 'No sonification or soundscape is connected in this preview, so there are no playback controls. We would rather show nothing than a control that does nothing.' },
      { h: 'What listening will be', p: 'Each experience will offer a data sonification — values mapped to pitch, rhythm and space by documented rules — and, separately labelled, an artistic soundscape.' },
      { h: 'Planned controls', p: 'Play and pause, volume, sonification versus soundscape, playback speed, stereo balance, a mono option and spoken audio description.' },
      { h: 'Meanwhile', p: 'Choose an experience to read its region, variable, planned audio mapping and the scientific sources it will draw on.' },
    ] },
  },
  ar: {
    about: { kicker: 'عن المشروع', title: 'بيانات الأرض بصوت مسموع', blocks: [
      { h: 'ما هو SONARA', p: 'يحوّل SONARA بيانات رصد الأرض إلى صوت، بهدف جعل بيانات كوكبنا أسهل وصولاً وأكثر تفاعلاً.' },
      { h: 'التجربة المتاحة', p: 'السماء الكهربائية هي التجربة المتاحة حالياً في مركز التحكم.' },
      { h: 'أرصاد البرق', p: 'تستخدم السماء الكهربائية مقتطفاً معالجاً من أرصاد البرق التابعة لمستشعر NASA ISS LIS.' },
      { h: 'التحويل الصوتي', p: 'تُحوّل أرصاد البرق إلى أنماط موسيقية عبر التحويل الصوتي. الأصوات المولّدة تمثيل للبيانات وليست تسجيلات فعلية للبرق.' },
      { h: 'التجارب', p: 'المحيط الحي متاح ببيانات OSCAR لشهر نوفمبر ٢٠٢٣ وثلاث مقطوعات موسيقية. الغابة التي تتنفس والأرض المتجمدة ستتوفران قريباً.' },
    ] },
    access: { kicker: 'إمكانية الوصول', title: 'مصمم للاستكشاف دون بصر', blocks: [
      { h: 'دون الكرة ثلاثية الأبعاد', p: 'اختر تجربة من مركز التحكم بلوحة المفاتيح أو قارئ الشاشة. الكرة رفيق بصري اختياري، وتجربة البرق لا تحتاج إلى WebGL.' },
      { h: 'لوحة المفاتيح', p: 'ينقل Tab بين الروابط والأزرار وبطاقات التجارب. يفعّل Enter أو المسافة الأزرار. تضبط الأسهم المنزلقات وتبويبات الشرح العلمي، ويغلق Escape هذه اللوحة.' },
      { h: 'الإعلانات', p: 'يُعلن عن اختيار التجربة، وتتحدث لوحة السياق بالمنطقة والمتغير والمصادر نصاً.' },
      { h: 'اللغة والحركة', p: 'بدّل بين الإنجليزية والعربية من الرأس. تُخفَّف الحركة عندما يطلب نظامك ذلك.' },
      { h: 'الصوت', p: 'لا يعمل أي صوت قبل طلبك. تشمل السماء الكهربائية التشغيل والإيقاف المؤقت والمتابعة والإيقاف ومستوى الصوت والكتم.' },
    ] },
    listen: { kicker: 'الاستماع', title: 'الصوت غير متاح بعد', blocks: [
      { h: 'الحالة بصدق', p: 'لا يوجد تحويل صوتي أو مشهد صوتي متصل في هذه المعاينة، لذا لا توجد أزرار تشغيل.' },
      { h: 'ما سيكون عليه الاستماع', p: 'ستقدم كل تجربة تحويلاً صوتياً للبيانات بقواعد موثقة، ومشهداً صوتياً فنياً موسوماً بوضوح.' },
      { h: 'عناصر تحكم مخططة', p: 'تشغيل وإيقاف، ومستوى الصوت، والتبديل بين التحويل والمشهد، والسرعة، والتوازن، وخيار أحادي، ووصف صوتي.' },
      { h: 'في الأثناء', p: 'اختر تجربة لقراءة منطقتها ومتغيرها والربط الصوتي المخطط ومصادرها العلمية.' },
    ] },
  },
};

export function fmtLat(lat: number, lang: Lang) {
  const d = lat >= 0 ? (lang === 'ar' ? 'ش' : 'N') : (lang === 'ar' ? 'ج' : 'S');
  return `${Math.abs(lat).toFixed(2)}° ${d}`;
}
export function fmtLon(lon: number, lang: Lang) {
  const d = lon >= 0 ? (lang === 'ar' ? 'ق' : 'E') : (lang === 'ar' ? 'غ' : 'W');
  return `${Math.abs(lon).toFixed(2)}° ${d}`;
}

