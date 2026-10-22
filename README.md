# 知数 · 七年级自适应数学测评

左侧保留四个入口：自适应测评、能力报告、针对性练习、答题记录。

直接双击 dist/index.html 即可离线使用。项目原理、功能介绍、结果解释与数据来源见「项目说明.md」。

本次仅精简首页：删除“学习足迹”和“怎样少问、问准”两个栏目，去掉首页宣传横幅与多余文案；测评区保留范围、题量、基础追查设置和开始按钮。原有侧栏、学生档案、能力报告、针对性练习、答题记录及答题流程均已恢复。

## 修改和生成离线版

需要 Node.js。在本目录运行：

    node tests.cjs
    node build.cjs

界面代码位于 source/app.js 和 source/style.css，首页补充样式位于 source/adaptive.css。自适应算法 source/ability.js、图谱与题库保持原版。图谱与题库尚未经教师审核，测评结果应作为学习线索。

数据来源：https://github.com/xiaoyang111222/cn-math-taxonomy 。原始内容采用 CC BY-NC 4.0，许可全文见 source/LICENSE.upstream.txt。
