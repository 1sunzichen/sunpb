// Original introductory practice material, independent of a particular textbook edition.
const question = (id, text, options, answer, explanation) => ({ id, text, options, answer, explanation });
export const subjects = [
  { id: 'math', name: '数学', en: 'MATHEMATICS', icon: 'math', description: '让每一步推理，都有迹可循。', color: 'purple' },
  { id: 'english', name: '英语', en: 'ENGLISH', icon: 'english', description: '从一个句子，认识更大的世界。', color: 'blue' },
  { id: 'chinese', name: '语文', en: 'CHINESE', icon: 'chinese', description: '读懂文字，也学会表达自己。', color: 'orange' }
];
export const lessons = [
  { id: 'm7', subject: 'math', grade: 7, title: '有理数与数轴', subtitle: '把正负数，放到同一条线上', minutes: 12, tags: ['正数与负数', '绝对值', '有理数运算'],
    intro: '气温零下 3℃ 记作 −3℃，上升 5℃ 后是多少？借助数轴，就能看见数的大小和变化。',
    points: [ ['认识有理数', '整数和分数统称有理数。0 既不是正数，也不是负数。'], ['读懂数轴', '数轴要有原点、正方向和单位长度。向右的数总比向左的数大。'], ['理解绝对值', '一个数的绝对值是数轴上对应点到原点的距离，所以绝对值不会是负数。'] ],
    example: '例：−3 + 5 = 2。从 −3 出发，向右移动 5 个单位，到达 2。|−3| = 3，因为 −3 到原点的距离是 3。',
    questions: [question('m7-1', '下列数中，最小的是哪一个？', ['−2', '0', '−5', '3'], 2, '在数轴上，−5 在这几个数的最左侧，所以它最小。'), question('m7-2', '|−8| 的值是多少？', ['−8', '8', '0', '16'], 1, '绝对值表示到原点的距离。−8 距离原点 8 个单位。'), question('m7-3', '−3 + 5 的结果是？', ['−8', '−2', '2', '8'], 2, '从 −3 向右移动 5 个单位，得到 2。'), question('m7-4', '关于 0，下列说法正确的是？', ['0 是正数', '0 是负数', '0 不是有理数', '0 既不是正数，也不是负数'], 3, '0 是整数，因此是有理数，但它不属于正数或负数。'), question('m7-5', '−4 的相反数是？', ['4', '−4', '1/4', '0'], 0, '相反数只有符号不同，两个数相加为 0：−4 + 4 = 0。') ] },
  { id: 'e7', subject: 'english', grade: 7, title: '一般现在时', subtitle: '用简单的句子，讲述你的日常', minutes: 10, tags: ['日常习惯', '第三人称单数', '否定句'],
    intro: 'I read every day. 一般现在时常用来表达日常习惯、反复发生的动作或客观事实。',
    points: [['看时间线索', 'every day、usually、often 等词常常提示习惯性动作。'], ['注意第三人称单数', '在一般现在时肯定句中，主语是 he、she、it 或单数名词时，实义动词通常加 -s 或 -es。'], ['构成否定句', '实义动词的否定句使用 don’t / doesn’t + 动词原形。He doesn’t play tennis.']],
    example: 'I go to school by bus. → She goes to school by bus. → She doesn’t go to school by bus. 注意 doesn’t 后面用 go。',
    questions: [question('e7-1', 'She ____ English every morning.', ['read', 'reads', 'reading', 'to read'], 1, '主语 She 是第三人称单数，肯定句用 reads。'), question('e7-2', 'They ____ football on Sundays.', ['plays', 'playing', 'play', 'is play'], 2, '主语 They 是复数，一般现在时用动词原形 play。'), question('e7-3', 'He doesn’t ____ coffee.', ['drinks', 'drink', 'drinking', 'drank'], 1, 'doesn’t 后接动词原形 drink。'), question('e7-4', '____ your sister walk to school every day?', ['Do', 'Is', 'Does', 'Are'], 2, 'your sister 是第三人称单数，实义动词的一般疑问句用 Does。'), question('e7-5', '选出正确的句子。', ['The sun rise in the east.', 'The sun rises in the east.', 'The sun rising in the east.', 'The sun are rise in the east.'], 1, '客观事实可以用一般现在时，The sun 是第三人称单数，使用 rises。') ] },
  { id: 'c7', subject: 'chinese', grade: 7, title: '比喻与拟人', subtitle: '发现文字里的画面感', minutes: 10, tags: ['比喻', '拟人', '表达效果'],
    intro: '“月亮像一只小船”和“月亮悄悄探出头”，都写月亮，却使用了不同的修辞。',
    points: [['比喻：找到相似点', '把一种事物比作另一种不同类的事物，两者要有相似之处。'], ['拟人：赋予人的特点', '把事物当作人来写，让它具有人的动作、情感或神态。'], ['分析表达效果', '先指出修辞，再说明写出了对象的什么特点，最后联系语境谈情感。']],
    example: '“弯弯的月亮像一只小船”把月亮比作小船，突出弯曲的形状；“小草向我们点头”赋予小草人的动作，属于拟人。',
    questions: [question('c7-1', '“荷叶像一把把绿色的小伞”运用了什么修辞？', ['拟人', '比喻', '反问', '排比'], 1, '把荷叶比作小伞，抓住两者形状的相似点，是比喻。'), question('c7-2', '哪一句使用了拟人？', ['湖面像镜子。', '风儿轻轻唱着歌。', '他跑得很快。', '天上的星星很多。'], 1, '“唱着歌”是人的行为，赋予风这一特点，是拟人。'), question('c7-3', '“他长得像他的爸爸”是否属于比喻？', ['是，因为有“像”', '是，因为有两个人', '不是，只是同类事物的比较', '是，属于暗喻'], 2, '有“像”不一定是比喻，这里只是比较父子相貌相似。'), question('c7-4', '“教室里安静得连针落地都听得见”主要运用了？', ['夸张', '拟人', '设问', '借代'], 0, '有意放大安静的程度，属于夸张。'), question('c7-5', '分析修辞效果时，哪一种表述更具体？', ['很生动。', '写得非常好。', '用了修辞手法。', '把荷叶比作小伞，形象地写出荷叶圆大、舒展的样子。'], 3, '分析应联系具体对象与特点，不能只写“生动形象”等空泛评价。') ] },
  { id: 'm8', subject: 'math', grade: 8, title: '一次函数的图像', subtitle: '从一个式子，看见变化的方向', minutes: 15, tags: ['一次函数', '斜率', '坐标'],
    intro: '出租车费用随路程变化，水位随时间上升。一次函数可以描述一些均匀变化的关系。',
    points: [['认识表达式', '一次函数的一般形式为 y = kx + b，其中 k ≠ 0。b = 0 时，它是正比例函数。'], ['判断增减', 'k > 0 时，y 随 x 增大而增大；k < 0 时，y 随 x 增大而减小。'], ['找截距与画图', '令 x = 0 得 y = b，所以图像与 y 轴交于 (0, b)。确定两个点即可画出直线。']],
    example: 'y = 2x + 1：x = 0 时 y = 1，x = 1 时 y = 3。连接 (0, 1) 和 (1, 3) 就得到图像；k = 2 > 0，图像向右上方延伸。',
    questions: [question('m8-1', '下列哪个是一次函数？', ['y = x²', 'y = 2x + 3', 'y = 1/x', 'y = 5'], 1, '一次函数是 y = kx + b 且 k ≠ 0，因此 y = 2x + 3 符合。'), question('m8-2', 'y = −3x + 2 中，x 增大时 y 如何变化？', ['增大', '减小', '不变', '无法判断'], 1, 'k = −3 < 0，所以 y 随 x 增大而减小。'), question('m8-3', '直线 y = 2x − 4 与 y 轴的交点是？', ['(2, 0)', '(0, 2)', '(0, −4)', '(−4, 0)'], 2, 'y 轴上 x = 0，代入得到 y = −4。'), question('m8-4', '点 (2, 5) 在直线 y = kx + 1 上，k 等于？', ['1', '2', '3', '4'], 1, '把 x = 2、y = 5 代入：5 = 2k + 1，解得 k = 2。'), question('m8-5', '下列哪个是正比例函数？', ['y = 3x + 1', 'y = −2x', 'y = 2', 'y = x²'], 1, '正比例函数为 y = kx，k ≠ 0，图像经过原点。') ] },
  { id: 'e8', subject: 'english', grade: 8, title: '一般过去时', subtitle: '把昨天的故事，讲清楚', minutes: 12, tags: ['过去式', '时间标志', 'did'],
    intro: 'I visited a museum yesterday. 一般过去时描述过去某个时间发生的动作或存在的状态。',
    points: [['识别过去时间', 'yesterday、last week、two days ago 等常表示过去的时间。'], ['规则与不规则变化', '规则动词过去式通常加 -ed；不规则动词要单独记忆，如 go → went、see → saw。'], ['did 后用原形', '一般疑问句常用 Did + 主语 + 动词原形；否定句用 didn’t + 动词原形。']],
    example: 'She went to the library yesterday. → Did she go to the library yesterday? → She didn’t go to the library yesterday.',
    questions: [question('e8-1', 'We ____ a film last night.', ['watch', 'watches', 'watched', 'watching'], 2, 'last night 表示过去，watch 的过去式是 watched。'), question('e8-2', 'Did you ____ breakfast this morning?', ['had', 'have', 'has', 'having'], 1, '助动词 Did 后使用动词原形 have。'), question('e8-3', 'go 的过去式是？', ['goed', 'gone', 'went', 'goes'], 2, 'go 是不规则动词，过去式为 went；gone 是过去分词。'), question('e8-4', 'She ____ at home yesterday.', ['is', 'are', 'were', 'was'], 3, 'She 是单数，be 动词的过去式用 was。'), question('e8-5', '选出正确的否定句。', ['He didn’t played tennis.', 'He doesn’t played tennis.', 'He didn’t play tennis.', 'He not played tennis.'], 2, '过去时否定句使用 didn’t + 动词原形。') ] },
  { id: 'c8', subject: 'chinese', grade: 8, title: '辨析说明方法', subtitle: '用准确的表达，把事物说明白', minutes: 12, tags: ['列数字', '作比较', '举例子'],
    intro: '说明文不仅告诉我们“是什么”，还通过恰当的方法，把特点讲清楚、讲准确。',
    points: [['列数字', '用具体数字说明对象的特点，让表述更准确、具体。'], ['作比较', '将两种事物放在一起比较，突出说明对象的特点。'], ['举例子', '用具体、有代表性的例子解释一般特点，让说明更容易理解。']],
    example: '“这座桥长 80 米”主要是列数字；“它比旁边的旧桥宽一倍”有作比较；“例如，仙人掌的叶退化成刺”是举例子。',
    questions: [question('c8-1', '“这座塔高 68 米”主要用了哪种说明方法？', ['列数字', '打比方', '下定义', '分类别'], 0, '用“68 米”具体、准确地说明塔的高度。'), question('c8-2', '“鲸比大象重得多”主要使用了？', ['举例子', '作比较', '列图表', '摹状貌'], 1, '把鲸与大象比较，突出鲸体重大的特点。'), question('c8-3', '“有些动物冬眠，例如青蛙、蛇等”使用了？', ['下定义', '打比方', '举例子', '引用'], 2, '用青蛙、蛇的例子具体说明有些动物冬眠。'), question('c8-4', '说明文中“大约”一词通常体现什么？', ['语言随意', '语言准确严谨', '表达夸张', '含义矛盾'], 1, '“大约”限定估计范围，避免把估计值写成精确值，体现严谨。'), question('c8-5', '分析说明方法作用时，最应结合什么？', ['作者名气', '文章篇幅', '具体说明对象及其特点', '生僻字数量'], 2, '方法服务于内容，作用必须落到对象的具体特点上。') ] },
  { id: 'm9', subject: 'math', grade: 9, title: '二次函数的顶点', subtitle: '读懂抛物线的转折点', minutes: 15, tags: ['开口方向', '顶点式', '对称轴'],
    intro: '从投篮轨迹到喷泉水线，生活中有许多近似抛物线的形状。顶点式让图像的关键特征一目了然。',
    points: [['认识顶点式', 'y = a(x − h)² + k，a ≠ 0。顶点坐标为 (h, k)，对称轴为 x = h。'], ['判断开口', 'a > 0 时开口向上，顶点处有最小值；a < 0 时开口向下，顶点处有最大值。'], ['小心符号', 'y = (x + 2)² − 3 可写成 y = (x − (−2))² − 3，顶点是 (−2, −3)。']],
    example: 'y = 2(x − 1)² + 3 的顶点是 (1, 3)，对称轴为 x = 1，开口向上，最小值为 3。',
    questions: [question('m9-1', 'y = (x − 2)² + 1 的顶点是？', ['(−2, 1)', '(2, 1)', '(2, −1)', '(1, 2)'], 1, '顶点式 y = a(x − h)² + k 的顶点为 (h, k)。'), question('m9-2', 'y = −2x² 的开口方向是？', ['向上', '向下', '向左', '向右'], 1, '二次项系数 a = −2 < 0，开口向下。'), question('m9-3', 'y = (x + 3)² 的对称轴是？', ['x = 3', 'y = 3', 'x = −3', 'y = −3'], 2, 'x + 3 = x − (−3)，所以 h = −3，对称轴为 x = −3。'), question('m9-4', 'y = (x − 1)² − 4 的最小值是？', ['1', '−1', '4', '−4'], 3, '平方项最小为 0，在 x = 1 时 y 取最小值 −4。'), question('m9-5', '哪个点在 y = x² 的图像上？', ['(2, 2)', '(−2, −4)', '(−2, 4)', '(0, 1)'], 2, '当 x = −2 时，y = (−2)² = 4。') ] },
  { id: 'e9', subject: 'english', grade: 9, title: '一般现在时的被动语态', subtitle: '把关注点，放在动作的承受者', minutes: 15, tags: ['be + 过去分词', '主被动转换', '主谓一致'],
    intro: 'People grow tea here. → Tea is grown here. 当我们更关注“茶被种植”时，就可以使用被动语态。',
    points: [['基本结构', '一般现在时的被动语态是 am / is / are + 动词过去分词。'], ['根据主语选择 be', '单数主语常用 is，复数主语用 are；主语为 I 时用 am。'], ['过去分词不是原形', '规则动词过去分词通常加 -ed；不规则形式需要记忆，如 make → made、write → written。']],
    example: 'Workers make these toys. → These toys are made by workers. toys 是复数，用 are；make 的过去分词为 made。',
    questions: [question('e9-1', 'English ____ in many countries.', ['speak', 'speaks', 'is spoken', 'are spoken'], 2, 'English 是动作承受者且为单数概念，用 is spoken。'), question('e9-2', 'These books ____ by young people.', ['is read', 'are read', 'reads', 'reading'], 1, 'books 是复数，用 are + 过去分词 read。'), question('e9-3', 'make 的过去分词是？', ['maked', 'making', 'makes', 'made'], 3, 'make 的过去式和过去分词都是 made。'), question('e9-4', '将 People clean the room every day. 改为被动语态。', ['The room cleans every day.', 'The room is cleaned every day.', 'The room are cleaned every day.', 'The room is clean every day.'], 1, 'the room 是单数，被动结构使用 is cleaned。'), question('e9-5', '被动语态主要强调什么？', ['动作的承受者', '动作一定在过去', '动作一定没完成', '动作一定是习惯'], 0, '被动语态将动作承受者作为主语；时间仍由时态决定。') ] },
  { id: 'c9', subject: 'chinese', grade: 9, title: '论点、论据与论证', subtitle: '读懂观点，也让观点站得住', minutes: 12, tags: ['中心论点', '事实论据', '论证方法'],
    intro: '“阅读有助于拓宽视野。”怎样让这个观点更有说服力？议论文需要观点、依据和推理相互配合。',
    points: [['论点：作者主张什么', '论点是作者对问题提出的见解或主张，通常能用明确的判断句表达。'], ['论据：凭什么这样说', '事实论据包括具体事例、数据等；道理论据包括公认原理、格言等。论据要真实、典型，并能支持论点。'], ['论证：如何建立联系', '论证是用论据证明论点的过程，常见方法有举例论证、道理论证、对比论证、比喻论证。']],
    example: '观点：“坚持练习有助于提高写作能力。”若举某同学持续修改作文、表达逐步进步的事例，并解释其中的联系，就是举例论证。',
    questions: [question('c9-1', '下列哪一句最适合作为论点？', ['什么是阅读？', '阅读的故事。', '阅读有助于拓宽视野。', '一本厚厚的书。'], 2, '论点应是明确表达见解或主张的判断句。'), question('c9-2', '具体、真实的人物事例通常属于？', ['事实论据', '中心论点', '道理论据', '论题'], 0, '人物事例是事实材料，可作为事实论据。'), question('c9-3', '列举具体事例来证明观点，属于？', ['比喻论证', '举例论证', '对比论证', '假设论证'], 1, '通过具体事例支撑观点，是举例论证。'), question('c9-4', '选择论据时，最关键的是？', ['越长越好', '越新奇越好', '真实且能支持论点', '必须引用名人'], 2, '论据必须真实可靠，与论点有直接的证明关系。'), question('c9-5', '把正反两方面进行比较以突出观点，属于？', ['对比论证', '举例论证', '比喻论证', '描写'], 0, '对比论证通过正反或不同情形的对照，突出观点。') ] }
];
export function publicCurriculum() {
  return { subjects, lessons: lessons.map(lesson => ({ ...lesson, questions: lesson.questions.map(({ answer, explanation, ...q }) => q) })) };
}
export function summarize(progress) {
  const solved = new Set(progress.filter(p => p.correct).map(p => p.question_id));
  const completed = lessons.filter(l => l.questions.every(q => solved.has(q.id))).map(l => l.id);
  return { solved: [...solved], completed, score: solved.size * 10 + completed.length * 20 };
}
