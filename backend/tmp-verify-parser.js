/* eslint-disable */
const { SummaryService } = require('./dist/src/modules/material/services/summary.service.js');
const { UrlParserService } = require('./dist/src/modules/material/services/url-parser.service.js');

const s = new SummaryService();
const html =
  '<html><head><title>测试标题</title><meta property="og:title" content="社交标题"/></head>' +
  '<body><article><script>x</script>这是一段用于测试的正文内容，介绍人工智能和机器学习的基础知识。' +
  '人工智能是计算机科学的一个重要分支。人工智能和机器学习在现代社会中应用广泛。</article></body></html>';

const u = new UrlParserService();
const parsed = u.parseHtml(html, 'https://example.com');
console.log('标题:', parsed.title);
console.log('正文:', parsed.text.slice(0, 60));
console.log('摘要:', s.generateSummary(parsed.text));
console.log('标签:', JSON.stringify(s.generateTags(parsed.text)));
console.log('OK');
