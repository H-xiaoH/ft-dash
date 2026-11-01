# 指标说明文案重写
- 四项说明讲清衡量对象、读数含义及各自局限，保留各自独立弹窗。
- 移除无依据的合格评级、SQN >7 样本太少及统一30笔断言。
- 分档仅解释界面颜色，由 RATIO_BANDS 插值，不修改指标或阈值。
- 中英文同步；提醒比较统计区间、交易笔数、资金及计算口径。
- 更新并运行现有说明弹窗 E2E，以及 i18n/ratios 单测、typecheck、lint、format、build。

依据：用户确认的说明草稿；Freqtrade 指标实现 https://github.com/freqtrade/freqtrade/blob/stable/freqtrade/data/metrics.py 。本规格替代 ratio-guide.md 中旧的文案评级及统一样本门槛，交互和阈值不变。
