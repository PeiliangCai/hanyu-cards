# 词库内容审核

当前词库不能仅凭构建和测试通过就认定为可商用的教学内容。扫描基于仓库 `src/data/hskWords.json`，没有调用 AI 自动重写释义或读音。

- 共 2,209 条：标记 HSK 1 的 506 条、HSK 2 的 750 条、HSK 3 的 953 条。发布前应确认采用的 HSK 标准版本、词表覆盖范围及来源版本，不把这些数字宣传为官方认证覆盖率。
- 93 条释义以 `surname` 开头，提示字典首义可能不适合作为入门默认词义。例如：白 → `Bái / surname Bai`、百 → `Bǎi / surname Bai`、过 → `Guō / surname Guo`、坐 → `Zuò / surname Zuo`。
- 多音字和虚词需结合课程语境审核。例如几目前为 `jī / small table`，行目前为 `háng / row; line; commercial firm`。这些读音或义项本身可能成立，但不能据此认定它们适合作为当前卡片的唯一入门读音和释义。不要把所有姓氏项、多音字一律自动改成某个读音。
- 存在 24 组相同英文释义，例如姐／姐姐的 `older sister`、听到／听见的 `to hear`。同义词不一定是内容错误；本次已让选择题按英文显示文本去重，避免相同选项因词条 ID 不同而误判。不同措辞的近义释义仍需教研检查题目歧义。

待审条目见 [content-review.csv](./content-review.csv)。`surname_first_definition` 是按当前英文文本扫描得到的候选；`polyphonic_or_particle_review` 是明确列出的多音字／虚词抽样候选，不是完整的多音字识别结果。CSV 中的候选标记不等于已确认错误，其余未标记条目也不代表审核通过。

运行 `node scripts/audit-content.mjs` 输出完整 JSON 报告；运行 `node scripts/audit-content.mjs --csv > content-review-new.csv` 生成新审核表。使用新文件名，避免覆盖已经填写的教研意见。

发布前由中文教学人员逐条确认：默认词义是否匹配等级和教学场景、拼音与声调和义项是否一致、简繁体对应是否适当、音频朗读是否匹配，以及例句是否准确且有授权来源。修改时保留稳定的 `id`，同时更新 `pinyin`、`numericPinyin`、`english` 等相关字段；记录审核人、依据和结论。先完成高频误导项的人工复核，再进行整库与全部场景的教学抽检；具体内容授权和归属继续以第三方声明及发布清单核验。
