/* 红笔 HONGBI · 后端种子题库（与前端 js/data.js 中的官方精选保持一致） */
'use strict';

const SEED_SETS = [
  {
    id: 'seed_cs',
    title: '计算机基础 · 常识',
    desc: '从二进制到操作系统，覆盖最常见的计算机基础考点，适合入门自测。',
    category: '计算机',
    tags: ['入门', '常识'],
    source: 'official',
    owner: '官方精选',
    createdAt: 0,
    questions: [
      { q: '二进制数 1011 转换为十进制是多少？', options: ['9', '10', '11', '12'], answer: '11', explanation: '1×8 + 0×4 + 1×2 + 1×1 = 11。' },
      { q: '下列哪个是易失性存储器？', options: ['ROM', '硬盘', 'RAM', '光盘'], answer: 'RAM', explanation: 'RAM 断电后数据丢失，属于易失性存储器。' },
      { q: '1 GB 等于多少 MB？', options: ['1000', '1024', '10240', '512'], answer: '1024', explanation: '1 GB = 1024 MB（二进制换算）。' },
      { q: '下列哪个不是操作系统？', options: ['Windows', 'Linux', 'macOS', 'Microsoft Office'], answer: 'Microsoft Office', explanation: 'Office 是应用软件，不是操作系统。' },
      { q: 'HTTP 默认端口号是？', options: ['21', '25', '80', '443'], answer: '80', explanation: 'HTTP 默认 80，HTTPS 默认 443，FTP 默认 21，SMTP 默认 25。' },
      { q: 'CPU 的中文全称是？', options: ['中央处理器', '存储器', '输入设备', '显卡'], answer: '中央处理器', explanation: 'CPU = Central Processing Unit，中央处理器。' },
      { q: '下列哪种文件格式属于压缩文件格式？', options: ['.docx', '.zip', '.exe', '.txt'], answer: '.zip', explanation: '.zip 是常见压缩格式，.docx 本质也是 zip 容器，但常规分类取 .zip。' },
      { q: '计算机病毒的本质是？', options: ['生物病毒', '一段程序', '硬件故障', '网络信号'], answer: '一段程序', explanation: '病毒是人为编写的、具有自我复制能力的恶意程序。' },
      { q: '下列哪个协议用于发送电子邮件？', options: ['FTP', 'SMTP', 'HTTP', 'DNS'], answer: 'SMTP', explanation: 'SMTP 用于邮件发送，POP3/IMAP 用于收取。' },
      { q: '十进制 255 转换为十六进制是？', options: ['FF', 'FE', '15F', '100'], answer: 'FF', explanation: '255 = 15×16 + 15，即 0xFF。' }
    ]
  },
  {
    id: 'seed_fe',
    title: '前端开发 · 面试八股',
    desc: 'HTML / CSS / JavaScript 高频面试题，选择与简答混合，检验基本功。',
    category: '前端',
    tags: ['面试', 'HTML', 'CSS', 'JS'],
    source: 'official',
    owner: '官方精选',
    createdAt: 0,
    questions: [
      { q: '下列哪个不是 HTML 标签？', options: ['<div>', '<span>', '<section>', '<format>'], answer: '<format>', explanation: '<format> 不是标准 HTML 标签。' },
      { q: 'CSS 中让 flex 子元素在交叉轴居中的属性是？', options: ['justify-content', 'align-items', 'align-self', 'text-align'], answer: 'align-items', explanation: '主轴用 justify-content，交叉轴用 align-items。' },
      { q: 'typeof null 的返回值是？', answer: 'object', explanation: '历史遗留 bug，但面试常考，记住即可。' },
      { q: '下列哪个选择器优先级最高？', options: ['元素选择器', '类选择器', 'ID 选择器', '通配符'], answer: 'ID 选择器', explanation: '优先级：!important > 内联 > ID > 类/属性 > 元素 > 通配符。' },
      { q: '用 ES6 写一行数组去重：', answer: '[...new Set(arr)]', explanation: 'Set 天然去重，展开运算符转回数组。' },
      { q: 'HTTP 状态码 404 表示？', options: ['服务器内部错误', '未找到', '重定向', '请求成功'], answer: '未找到', explanation: '404 Not Found；500 是服务器错误，3xx 是重定向，200 是成功。' },
      { q: 'var / let / const 中，哪个存在变量提升？', answer: 'var', explanation: 'var 有提升且可重复声明，let/const 存在暂时性死区。' },
      { q: '<meta charset="utf-8"> 的作用是？', options: ['定义网页标题', '声明字符编码', '引入脚本', '设置视口'], answer: '声明字符编码', explanation: '声明文档使用 UTF-8 编码，避免乱码。' }
    ]
  },
  {
    id: 'seed_en',
    title: '英语 · 四六级高频词',
    desc: '十个高频核心词汇，中英对照自测，适合碎片时间过一遍。',
    category: '语言学习',
    tags: ['英语', '四六级', '词汇'],
    source: 'official',
    owner: '官方精选',
    createdAt: 0,
    questions: [
      { q: 'abandon', answer: 'v. 放弃；抛弃', explanation: 'abandon a plan 放弃计划。' },
      { q: 'absolute', answer: 'adj. 绝对的；完全的', explanation: 'absolute power 绝对权力。' },
      { q: 'acquire', answer: 'v. 获得；取得', explanation: 'acquire knowledge 获取知识。' },
      { q: 'brief', answer: 'adj. 简短的；n. 摘要', explanation: 'a brief introduction 简短介绍。' },
      { q: 'challenge', answer: 'n./v. 挑战', explanation: 'face the challenge 面对挑战。' },
      { q: 'demonstrate', answer: 'v. 证明；演示', explanation: 'demonstrate the theory 证明该理论。' },
      { q: 'efficient', answer: 'adj. 高效的', explanation: 'an efficient way 高效的方法。' },
      { q: 'fundamental', answer: 'adj. 基本的；根本的', explanation: 'fundamental principles 基本原则。' },
      { q: 'genuine', answer: 'adj. 真正的；真诚的', explanation: 'genuine interest 真正的兴趣。' },
      { q: 'inevitable', answer: 'adj. 不可避免的', explanation: 'the inevitable result 必然的结果。' }
    ]
  },
  {
    id: 'seed_hist',
    title: '历史 · 中国古代史',
    desc: '从秦朝到明朝的常识考点，帮你理清时间线。',
    category: '历史',
    tags: ['中国史', '常识'],
    source: 'official',
    owner: '官方精选',
    createdAt: 0,
    questions: [
      { q: '秦朝统一六国是在哪一年？', options: ['公元前 230 年', '公元前 221 年', '公元前 206 年', '公元前 202 年'], answer: '公元前 221 年', explanation: '公元前 221 年秦王嬴政统一六国，建立秦朝。' },
      { q: '丝绸之路的开辟与哪位人物有关？', options: ['郑和', '张骞', '班超', '苏武'], answer: '张骞', explanation: '张骞出使西域，开辟了丝绸之路。' },
      { q: '唐朝的建立者是？', options: ['李世民', '李渊', '李隆基', '武则天'], answer: '李渊', explanation: '李渊建立唐朝，李世民是第二位皇帝。' },
      { q: '活字印刷术的发明者是？', options: ['毕昇', '蔡伦', '沈括', '祖冲之'], answer: '毕昇', explanation: '北宋毕昇发明泥活字印刷术；蔡伦改进造纸术。' },
      { q: '郑和下西洋发生在哪个朝代？', options: ['唐', '宋', '元', '明'], answer: '明', explanation: '明成祖永乐年间，郑和七下西洋。' },
      { q: '"文景之治"出现在哪个朝代？', options: ['秦', '汉', '隋', '唐'], answer: '汉', explanation: '西汉汉文帝、汉景帝时期的治世。' },
      { q: '科举制度正式创立于哪个朝代？', options: ['汉', '隋', '唐', '宋'], answer: '隋', explanation: '隋炀帝设进士科，科举制正式形成。' },
      { q: '《史记》的作者是？', options: ['班固', '司马迁', '司马光', '左丘明'], answer: '司马迁', explanation: '《史记》是司马迁所著纪传体通史；司马光著《资治通鉴》。' }
    ]
  }
];

module.exports = { SEED_SETS };
