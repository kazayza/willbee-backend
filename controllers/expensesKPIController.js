const { sql } = require('../config/db');

// ════════════════════════════════════════════════════════════
// 📅 دالة حساب فترات المقارنة العادلة
// ════════════════════════════════════════════════════════════
const calculateComparisonDates = (periodType, customStart, customEnd) => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const DAY_MS = 24 * 60 * 60 * 1000;

    let currentStart, currentEnd, prevStart, prevEnd, lastYearStart, lastYearEnd;

    switch (periodType) {

        case 'custom':
            if (!customStart || !customEnd) {
                throw new Error('لازم تحدد تاريخ البداية والنهاية');
            }
            currentStart = new Date(customStart);
            currentEnd = new Date(customEnd);
            const duration = Math.floor((currentEnd - currentStart) / DAY_MS);
            prevEnd = new Date(currentStart.getTime() - DAY_MS);
            prevStart = new Date(prevEnd.getTime() - (duration * DAY_MS));
            lastYearStart = new Date(currentStart);
            lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
            lastYearEnd = new Date(currentEnd);
            lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1);
            if (isNaN(lastYearEnd.getTime())) {
                lastYearEnd = new Date(currentYear - 1, currentEnd.getMonth() + 1, 0);
            }
            break;

        case 'quarter':
            const currentQuarter = Math.floor(currentMonth / 3);
            const quarterStartMonth = currentQuarter * 3;
            currentStart = new Date(currentYear, quarterStartMonth, 1);
            currentEnd = now;
            const daysIntoQuarter = Math.floor((now - currentStart) / DAY_MS);
            const prevQuarterMonth = quarterStartMonth - 3;
            if (prevQuarterMonth >= 0) {
                prevStart = new Date(currentYear, prevQuarterMonth, 1);
            } else {
                prevStart = new Date(currentYear - 1, 9, 1);
            }
            prevEnd = new Date(prevStart.getTime() + (daysIntoQuarter * DAY_MS));
            lastYearStart = new Date(currentYear - 1, quarterStartMonth, 1);
            lastYearEnd = new Date(lastYearStart.getTime() + (daysIntoQuarter * DAY_MS));
            break;

        case 'year':
            currentStart = new Date(currentYear, 0, 1);
            currentEnd = now;
            prevStart = new Date(currentYear - 1, 0, 1);
            prevEnd = new Date(currentYear - 1, currentMonth, currentDay);
            if (currentMonth === 1 && currentDay === 29) {
                const prevFebDays = new Date(currentYear - 1, 2, 0).getDate();
                if (prevFebDays < 29) {
                    prevEnd = new Date(currentYear - 1, 1, 28);
                }
            }
            lastYearStart = new Date(currentYear - 2, 0, 1);
            lastYearEnd = new Date(currentYear - 2, currentMonth, currentDay);
            break;

        case 'month':
        default:
            currentStart = new Date(currentYear, currentMonth, 1);
            currentEnd = now;
            prevStart = new Date(currentYear, currentMonth - 1, 1);
            const lastDayPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
            prevEnd = new Date(currentYear, currentMonth - 1, Math.min(currentDay, lastDayPrevMonth));
            const lastDayPrevYearMonth = new Date(currentYear - 1, currentMonth + 1, 0).getDate();
            lastYearStart = new Date(currentYear - 1, currentMonth, 1);
            lastYearEnd = new Date(currentYear - 1, currentMonth, Math.min(currentDay, lastDayPrevYearMonth));
            break;
    }

    const currentDays = Math.floor((currentEnd - currentStart) / DAY_MS) + 1;
    const prevDays = Math.floor((prevEnd - prevStart) / DAY_MS) + 1;
    const lastYearDays = Math.floor((lastYearEnd - lastYearStart) / DAY_MS) + 1;

    return {
        current: { start: currentStart, end: currentEnd, days: currentDays },
        previous: { start: prevStart, end: prevEnd, days: prevDays },
        lastYear: { start: lastYearStart, end: lastYearEnd, days: lastYearDays },
        meta: {
            periodType: periodType || 'month',
            fairComparison: currentDays === prevDays
        }
    };
};

// ════════════════════════════════════════════════════════════
// 🔧 دالة مساعدة لحساب نسبة التغير
// ════════════════════════════════════════════════════════════
const calcChange = (current, compare) => {
    if (compare === 0) return current > 0 ? 100 : 0;
    return parseFloat(((current - compare) / compare * 100).toFixed(1));
};

// ════════════════════════════════════════════════════════════
// 📊 دالة توليد التحليل المالي الاحترافي
// ════════════════════════════════════════════════════════════
const generateFinancialAnalysis = (data) => {
    const {
        totalCurrent, totalPrevious, totalLastYear,
        groupsData, branchesData, advanced, forecast, dates
    } = data;

    const analysis = {
        executiveSummary: '',
        deviationAnalysis: [],
        riskAnalysis: [],
        positivePoints: [],
        forecast: '',
        yearComparison: '',
        recommendations: []
    };

    const prevChange = calcChange(totalCurrent, totalPrevious);
    const lyChange = calcChange(totalCurrent, totalLastYear);
    const direction = prevChange > 0 ? 'بزيادة' : 'بانخفاض';

    // ──────────────────────────────────────────
    // 1. الملخص التنفيذي
    // ──────────────────────────────────────────
    const topIncreaseGroup = groupsData
        .filter(g => g.vsPrevious.change > 0)
        .sort((a, b) => b.vsPrevious.change - a.vsPrevious.change)[0];

    let mainCause = '';
    if (topIncreaseGroup) {
        mainCause = `، ويُعزى ذلك بشكل رئيسي إلى ارتفاع بند "${topIncreaseGroup.group}" بنسبة ${topIncreaseGroup.vsPrevious.change}%`;
    }

    analysis.executiveSummary = `بلغ إجمالي المصروفات التشغيلية للفترة الحالية ${totalCurrent.toLocaleString()} ج.م ${direction} قدرها ${Math.abs(prevChange)}% عن الفترة المماثلة من الشهر السابق (${totalPrevious.toLocaleString()} ج.م)${mainCause}.`;

    // ──────────────────────────────────────────
    // 2. تحليل الانحرافات
    // ──────────────────────────────────────────
    const significantChanges = groupsData
        .filter(g => Math.abs(g.vsPrevious.change) > 15)
        .sort((a, b) => Math.abs(b.vsPrevious.change) - Math.abs(a.vsPrevious.change));

    significantChanges.forEach(group => {
        const diff = group.current - group.vsPrevious.amount;
        if (group.vsPrevious.change > 0) {
            analysis.deviationAnalysis.push(
                `سجل بند "${group.group}" ارتفاعاً بنسبة ${group.vsPrevious.change}% بزيادة قدرها ${Math.abs(diff).toLocaleString()} ج.م مقارنة بالفترة السابقة.`
            );
        } else {
            analysis.deviationAnalysis.push(
                `حقق بند "${group.group}" انخفاضاً بنسبة ${Math.abs(group.vsPrevious.change)}% بتوفير قدره ${Math.abs(diff).toLocaleString()} ج.م مقارنة بالفترة السابقة.`
            );
        }
    });

    if (analysis.deviationAnalysis.length === 0) {
        analysis.deviationAnalysis.push('لم تُسجل انحرافات جوهرية تتجاوز 15% في أي من بنود المصروفات خلال الفترة الحالية.');
    }

    // ──────────────────────────────────────────
    // 3. تحليل المخاطر والتركز
    // ──────────────────────────────────────────

    // تركز الفروع
    if (branchesData.length > 0) {
        const topBranch = branchesData[0];
        const topBranchPercent = totalCurrent > 0
            ? parseFloat(((topBranch.current / totalCurrent) * 100).toFixed(1))
            : 0;

        if (topBranchPercent > 50) {
            analysis.riskAnalysis.push(
                `يُلاحظ تركز ${topBranchPercent}% من إجمالي المصروفات في "${topBranch.name}"، مما يشكل مخاطر تشغيلية تستدعي إعادة توزيع الموارد.`
            );
        }
    }

    // قفزات غير طبيعية
    groupsData.forEach(group => {
        if (group.vsPrevious.change > 50) {
            analysis.riskAnalysis.push(
                `تنبيه: ارتفاع غير اعتيادي في بند "${group.group}" بنسبة ${group.vsPrevious.change}% يستدعي المراجعة الفورية.`
            );
        }
    });

    // مصروف فردي غير عادي
    if (advanced && advanced.maxSingleExpense > advanced.avgPerTransaction * 5) {
        analysis.riskAnalysis.push(
            `رُصدت عملية صرف فردية بمبلغ ${advanced.maxSingleExpense.toLocaleString()} ج.م وهي تتجاوز 5 أضعاف المتوسط العام للمعاملات (${advanced.avgPerTransaction.toLocaleString()} ج.م).`
        );
    }

    if (analysis.riskAnalysis.length === 0) {
        analysis.riskAnalysis.push('لم تُرصد مخاطر تشغيلية أو انحرافات غير اعتيادية خلال الفترة الحالية.');
    }

    // ──────────────────────────────────────────
    // 4. النقاط الإيجابية
    // ──────────────────────────────────────────
    const savings = groupsData
        .filter(g => g.vsPrevious.change < -10)
        .sort((a, b) => a.vsPrevious.change - b.vsPrevious.change);

    savings.forEach(group => {
        const saved = Math.abs(group.current - group.vsPrevious.amount);
        analysis.positivePoints.push(
            `تحقق انخفاض ملحوظ في بند "${group.group}" بنسبة ${Math.abs(group.vsPrevious.change)}% بتوفير قدره ${saved.toLocaleString()} ج.م، مما يعكس فعالية إجراءات الترشيد المتخذة.`
        );
    });

    if (prevChange < 0) {
        analysis.positivePoints.push(
            `حقق إجمالي المصروفات انخفاضاً عاماً بنسبة ${Math.abs(prevChange)}% مقارنة بالفترة السابقة مما يشير إلى تحسن في إدارة التكاليف.`
        );
    }

    if (analysis.positivePoints.length === 0) {
        analysis.positivePoints.push('لم تُسجل تحسينات ملموسة في بنود المصروفات خلال هذه الفترة، يُنصح بمراجعة سياسات الإنفاق.');
    }

    // ──────────────────────────────────────────
    // 5. التوقعات
    // ──────────────────────────────────────────
    if (forecast) {
        analysis.forecast = `بناءً على معدل الإنفاق اليومي الحالي البالغ ${forecast.dailyAverage.toLocaleString()} ج.م، يُتوقع أن يصل إجمالي المصروفات بنهاية الشهر إلى ${forecast.projectedTotal.toLocaleString()} ج.م. `;

        if (forecast.projectedTotal > totalPrevious * 1.2) {
            analysis.forecast += `وهذا التوقع يتجاوز مصروفات الفترة السابقة بنسبة كبيرة مما يستدعي اتخاذ إجراءات عاجلة لضبط الإنفاق.`;
        } else {
            analysis.forecast += `وهو معدل مقبول مقارنة بالفترات السابقة.`;
        }
    }

    // ──────────────────────────────────────────
    // 6. المقارنة السنوية
    // ──────────────────────────────────────────
    if (totalLastYear > 0) {
        const yearDirection = lyChange > 0 ? 'ارتفاعاً' : 'انخفاضاً';
        analysis.yearComparison = `مقارنة بنفس الفترة من العام السابق (${totalLastYear.toLocaleString()} ج.م)، سجلت المصروفات ${yearDirection} بنسبة ${Math.abs(lyChange)}%. `;

        if (lyChange > 15) {
            analysis.yearComparison += `هذا الارتفاع يتجاوز معدلات التضخم المتوقعة مما يستدعي مراجعة شاملة لسياسات الإنفاق وتحديد البنود المسببة لهذا النمو.`;
        } else if (lyChange > 0 && lyChange <= 15) {
            analysis.yearComparison += `وهو معدل نمو طبيعي يتماشى مع معدلات التضخم والنمو التشغيلي.`;
        } else {
            analysis.yearComparison += `مما يعكس نجاح السياسات المالية المتبعة في ضبط التكاليف التشغيلية.`;
        }
    }

    // ──────────────────────────────────────────
    // 7. التوصيات
    // ──────────────────────────────────────────
    if (prevChange > 30) {
        analysis.recommendations.push('مراجعة فورية لبنود المصروفات التي سجلت ارتفاعات تتجاوز 30% والتحقق من أسبابها.');
    }

    const highConcentrationBranches = branchesData.filter(b => {
        const percent = totalCurrent > 0 ? (b.current / totalCurrent) * 100 : 0;
        return percent > 40;
    });
    if (highConcentrationBranches.length > 0) {
        analysis.recommendations.push(`إعادة تقييم توزيع المصروفات على الفروع، حيث يستحوذ "${highConcentrationBranches[0].name}" على نسبة مرتفعة من الإجمالي.`);
    }

    const highGrowthGroups = groupsData.filter(g => g.vsPrevious.change > 25);
    highGrowthGroups.forEach(g => {
        analysis.recommendations.push(`وضع سقف إنفاق لبند "${g.group}" الذي سجل نمواً بنسبة ${g.vsPrevious.change}%.`);
    });

    if (forecast && forecast.projectedTotal > totalPrevious * 1.15) {
        analysis.recommendations.push('تطبيق إجراءات ترشيد فورية لضمان عدم تجاوز المصروفات المتوقعة لنهاية الشهر.');
    }

    if (analysis.recommendations.length === 0) {
        analysis.recommendations.push('الاستمرار في السياسات المالية الحالية مع المتابعة الدورية لمؤشرات الأداء.');
    }

    return analysis;
};

// ════════════════════════════════════════════════════════════
// 🚨 دالة توليد التنبيهات الذكية
// ════════════════════════════════════════════════════════════
const generateSmartInsights = (data) => {
    const {
        totalCurrent, totalPrevious, totalLastYear,
        groupsData, branchesData, advanced, forecast
    } = data;

    const insights = [];

    // 1. الاتجاه العام
    const overallChange = calcChange(totalCurrent, totalPrevious);
    if (overallChange > 0) {
        insights.push({
            type: 'warning',
            icon: '⚠️',
            title: 'زيادة في المصروفات',
            message: `ارتفاع ${overallChange}% مقارنة بالفترة السابقة`,
            priority: 'high'
        });
    } else if (overallChange < 0) {
        insights.push({
            type: 'success',
            icon: '✅',
            title: 'انخفاض في المصروفات',
            message: `توفير ${Math.abs(overallChange)}% مقارنة بالفترة السابقة`,
            priority: 'low'
        });
    }

    // 2. قفزات البنود
    groupsData.forEach(group => {
        if (group.vsPrevious.change > 50) {
            insights.push({
                type: 'danger',
                icon: '🔥',
                title: `قفزة في "${group.group}"`,
                message: `ارتفاع ${group.vsPrevious.change}% يستدعي المراجعة`,
                priority: 'high'
            });
        }
        if (group.vsPrevious.change < -30) {
            insights.push({
                type: 'success',
                icon: '💰',
                title: `توفير في "${group.group}"`,
                message: `انخفاض ${Math.abs(group.vsPrevious.change)}%`,
                priority: 'low'
            });
        }
    });

    // 3. تركز الفروع
    if (branchesData.length > 0 && totalCurrent > 0) {
        const topBranch = branchesData[0];
        const branchPercent = parseFloat(((topBranch.current / totalCurrent) * 100).toFixed(1));
        if (branchPercent > 50) {
            insights.push({
                type: 'info',
                icon: '🏢',
                title: 'تركز المصروفات',
                message: `"${topBranch.name}" يستهلك ${branchPercent}% من الإجمالي`,
                priority: 'medium'
            });
        }
    }

    // 4. مصروف غير عادي
    if (advanced && advanced.maxSingleExpense > advanced.avgPerTransaction * 5) {
        insights.push({
            type: 'warning',
            icon: '⚡',
            title: 'مصروف فردي غير عادي',
            message: `مبلغ ${advanced.maxSingleExpense.toLocaleString()} ج.م (${(advanced.maxSingleExpense / advanced.avgPerTransaction).toFixed(1)}x المتوسط)`,
            priority: 'high'
        });
    }

    // 5. توقع نهاية الشهر
    if (forecast && totalPrevious > 0) {
        const projectedChange = calcChange(forecast.projectedTotal, totalPrevious);
        if (projectedChange > 20) {
            insights.push({
                type: 'danger',
                icon: '🚨',
                title: 'تحذير: توقع تجاوز',
                message: `المتوقع نهاية الشهر ${forecast.projectedTotal.toLocaleString()} ج.م (+${projectedChange}%)`,
                priority: 'high'
            });
        }
    }

    // 6. مقارنة سنوية
    if (totalLastYear > 0) {
        const yearChange = calcChange(totalCurrent, totalLastYear);
        if (Math.abs(yearChange) > 20) {
            insights.push({
                type: yearChange > 0 ? 'warning' : 'success',
                icon: yearChange > 0 ? '📈' : '📉',
                title: 'مقارنة سنوية',
                message: `${yearChange > 0 ? 'ارتفاع' : 'انخفاض'} ${Math.abs(yearChange)}% عن نفس الفترة العام السابق`,
                priority: 'medium'
            });
        }
    }

    // 7. البند الأكثر تكراراً
    if (advanced && advanced.mostFrequentKind) {
        insights.push({
            type: 'info',
            icon: '🔄',
            title: 'أكثر بند تكراراً',
            message: `"${advanced.mostFrequentKind.name}" بعدد ${advanced.mostFrequentKind.count} معاملة`,
            priority: 'low'
        });
    }

    // ترتيب حسب الأولوية
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return insights;
};

// ════════════════════════════════════════════════════════════
// 🎯 الدالة الرئيسية - مؤشرات أداء المصروفات
// ════════════════════════════════════════════════════════════
const getExpensesKPI = async (req, res) => {
    const { periodType, startDate, endDate, branchId, groupId, kindId } = req.query;

    try {
        // ──────────────────────────────────────
        // 1. Validation
        // ──────────────────────────────────────
        const validPeriods = ['month', 'quarter', 'year', 'custom'];
        if (periodType && !validPeriods.includes(periodType)) {
            return res.status(400).json({
                error: 'periodType لازم يكون: month, quarter, year, أو custom'
            });
        }
        if (periodType === 'custom' && (!startDate || !endDate)) {
            return res.status(400).json({
                error: 'في حالة custom لازم تبعت startDate و endDate'
            });
        }
        if (periodType === 'custom' && new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({
                error: 'startDate لازم يكون قبل endDate'
            });
        }

        // ──────────────────────────────────────
        // 2. حساب الفترات
        // ──────────────────────────────────────
        const dates = calculateComparisonDates(periodType, startDate, endDate);

        // ──────────────────────────────────────
        // 3. إعداد الفلاتر
        // ──────────────────────────────────────
        let baseFilters = " AND e.Kind = N'اخرى' AND d.expenseKind <> 8";
        const params = {};

        if (branchId) {
            baseFilters += " AND d.expenseBranchtxt = @branchId";
            params.branchId = { type: sql.Int, value: parseInt(branchId) };
        }
        if (groupId) {
            baseFilters += " AND k.KindGroup = @groupId";
            params.groupId = { type: sql.NVarChar, value: groupId };
        }
        if (kindId) {
            baseFilters += " AND d.expenseKind = @kindId";
            params.kindId = { type: sql.Int, value: parseInt(kindId) };
        }

        // دالة مساعدة لإنشاء Request جديد
        const createRequest = () => {
            const request = new sql.Request();
            request.input('currStart', sql.Date, dates.current.start);
            request.input('currEnd', sql.Date, dates.current.end);
            request.input('prevStart', sql.Date, dates.previous.start);
            request.input('prevEnd', sql.Date, dates.previous.end);
            request.input('lyStart', sql.Date, dates.lastYear.start);
            request.input('lyEnd', sql.Date, dates.lastYear.end);

            Object.entries(params).forEach(([key, val]) => {
                request.input(key, val.type, val.value);
            });
            return request;
        };

        // ──────────────────────────────────────
        // 4. الاستعلامات
        // ──────────────────────────────────────

        // أ. المجموعات
        const groupsQuery = `
            SELECT 
                ISNULL(k.KindGroup, N'أخرى') as KindGroup,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as currentAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as previousAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @lyStart AND @lyEnd THEN d.expenseAmount ELSE 0 END) as lastYearAmount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE (
                e.expenseDate BETWEEN @prevStart AND @currEnd
                OR e.expenseDate BETWEEN @lyStart AND @lyEnd
            )
            ${baseFilters}
            GROUP BY k.KindGroup
            ORDER BY currentAmount DESC
        `;

        // ب. الفروع
        const branchesQuery = `
            SELECT 
                ISNULL(b.branchName, N'غير محدد') as branchName,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as currentAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as previousAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @lyStart AND @lyEnd THEN d.expenseAmount ELSE 0 END) as lastYearAmount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            LEFT JOIN tbl_Branch b ON d.expenseBranchtxt = b.IDbranch
            WHERE (
                e.expenseDate BETWEEN @prevStart AND @currEnd
                OR e.expenseDate BETWEEN @lyStart AND @lyEnd
            )
            ${baseFilters}
            GROUP BY b.branchName
            ORDER BY currentAmount DESC
        `;

        // ج. التريند اليومي (الحالي + السابق)
        const dailyTrendQuery = `
            SELECT 
                FORMAT(e.expenseDate, 'yyyy-MM-dd') as day,
                SUM(d.expenseAmount) as amount,
                'current' as period
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd
            ${baseFilters}
            GROUP BY FORMAT(e.expenseDate, 'yyyy-MM-dd')

            UNION ALL

            SELECT 
                FORMAT(e.expenseDate, 'yyyy-MM-dd') as day,
                SUM(d.expenseAmount) as amount,
                'previous' as period
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @prevStart AND @prevEnd
            ${baseFilters}
            GROUP BY FORMAT(e.expenseDate, 'yyyy-MM-dd')

            ORDER BY period, day ASC
        `;

        // د. أعلى 5 بنود
        const top5Query = `
            SELECT TOP 5
                ISNULL(k.KindName, N'غير محدد') as kindName,
                ISNULL(k.KindGroup, N'أخرى') as kindGroup,
                SUM(d.expenseAmount) as totalAmount,
                COUNT(*) as transactionCount,
                ROUND(
                    SUM(d.expenseAmount) * 100.0 / NULLIF(SUM(SUM(d.expenseAmount)) OVER(), 0), 1
                ) as percentOfTotal
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd
            ${baseFilters}
            GROUP BY k.KindName, k.KindGroup
            ORDER BY totalAmount DESC
        `;

        // هـ. أعلى 5 بنود ارتفاعاً
        const topIncreaseQuery = `
            SELECT TOP 5
                ISNULL(k.KindName, N'غير محدد') as kindName,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as currentAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as previousAmount,
                CASE 
                    WHEN SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) > 0
                    THEN ROUND(
                        (SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) - 
                         SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END)) * 100.0 /
                        SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END), 1
                    )
                    ELSE 100
                END as changePercent
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE (e.expenseDate BETWEEN @prevStart AND @currEnd)
            ${baseFilters}
            GROUP BY k.KindName
            HAVING SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) >
                   SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END)
            ORDER BY changePercent DESC
        `;

        // و. أعلى 5 بنود توفيراً
        const topSavingsQuery = `
            SELECT TOP 5
                ISNULL(k.KindName, N'غير محدد') as kindName,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as currentAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as previousAmount,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) -
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as savedAmount,
                CASE 
                    WHEN SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) > 0
                    THEN ROUND(
                        (SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) - 
                         SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END)) * 100.0 /
                        SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END), 1
                    )
                    ELSE 0
                END as savingPercent
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE (e.expenseDate BETWEEN @prevStart AND @currEnd)
            ${baseFilters}
            GROUP BY k.KindName
            HAVING SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) <
                   SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END)
            ORDER BY savedAmount DESC
        `;

        // ز. مؤشرات متقدمة
        const advancedQuery = `
            SELECT 
                AVG(d.expenseAmount) as avgPerTransaction,
                MAX(d.expenseAmount) as maxSingleExpense,
                MIN(d.expenseAmount) as minSingleExpense,
                COUNT(*) as totalTransactions,
                COUNT(DISTINCT CAST(e.expenseDate AS DATE)) as activeDays,
                STDEV(d.expenseAmount) as stdDeviation
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd
            ${baseFilters}
        `;

        // ح. تحليل أيام الأسبوع
        const weekdayQuery = `
            SELECT 
                DATEPART(WEEKDAY, e.expenseDate) as dayNumber,
                DATENAME(WEEKDAY, e.expenseDate) as dayName,
                SUM(d.expenseAmount) as totalAmount,
                AVG(d.expenseAmount) as avgAmount,
                COUNT(*) as transactionCount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd
            ${baseFilters}
            GROUP BY DATEPART(WEEKDAY, e.expenseDate), DATENAME(WEEKDAY, e.expenseDate)
            ORDER BY dayNumber
        `;

        // ط. أكثر بند تكراراً
        const mostFrequentQuery = `
            SELECT TOP 1
                ISNULL(k.KindName, N'غير محدد') as kindName,
                COUNT(*) as transactionCount,
                SUM(d.expenseAmount) as totalAmount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd
            ${baseFilters}
            GROUP BY k.KindName
            ORDER BY transactionCount DESC
        `;

        // ي. الموسمية (آخر 12 شهر)
        const seasonalQuery = `
            SELECT 
                FORMAT(e.expenseDate, 'yyyy-MM') as month,
                DATENAME(MONTH, e.expenseDate) as monthName,
                YEAR(e.expenseDate) as year,
                SUM(d.expenseAmount) as totalAmount,
                COUNT(*) as transactionCount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE e.expenseDate >= DATEADD(MONTH, -12, GETDATE())
            ${baseFilters}
            GROUP BY FORMAT(e.expenseDate, 'yyyy-MM'), DATENAME(MONTH, e.expenseDate), YEAR(e.expenseDate)
            ORDER BY month ASC
        `;

        // ──────────────────────────────────────
        // 5. تنفيذ كل الاستعلامات بالتوازي
        // ──────────────────────────────────────
        const [
            groupsResult,
            branchesResult,
            dailyResult,
            top5Result,
            topIncreaseResult,
            topSavingsResult,
            advancedResult,
            weekdayResult,
            mostFrequentResult,
            seasonalResult
        ] = await Promise.all([
            createRequest().query(groupsQuery),
            createRequest().query(branchesQuery),
            createRequest().query(dailyTrendQuery),
            createRequest().query(top5Query),
            createRequest().query(topIncreaseQuery),
            createRequest().query(topSavingsQuery),
            createRequest().query(advancedQuery),
            createRequest().query(weekdayQuery),
            createRequest().query(mostFrequentQuery),
            createRequest().query(seasonalQuery)
        ]);

        // ──────────────────────────────────────
        // 6. معالجة البيانات
        // ──────────────────────────────────────
        let totalCurrent = 0, totalPrevious = 0, totalLastYear = 0;
        let groupsData = [];
        let branchesData = [];

        // معالجة المجموعات
        groupsResult.recordset.forEach(row => {
            totalCurrent += row.currentAmount || 0;
            totalPrevious += row.previousAmount || 0;
            totalLastYear += row.lastYearAmount || 0;

            if (row.currentAmount > 0 || row.previousAmount > 0 || row.lastYearAmount > 0) {
                groupsData.push({
                    group: row.KindGroup,
                    current: row.currentAmount || 0,
                    vsPrevious: {
                        amount: row.previousAmount || 0,
                        change: calcChange(row.currentAmount, row.previousAmount)
                    },
                    vsLastYear: {
                        amount: row.lastYearAmount || 0,
                        change: calcChange(row.currentAmount, row.lastYearAmount)
                    }
                });
            }
        });

        // معالجة الفروع
        branchesResult.recordset.forEach(row => {
            if (row.currentAmount > 0 || row.previousAmount > 0 || row.lastYearAmount > 0) {
                branchesData.push({
                    name: row.branchName,
                    current: row.currentAmount || 0,
                    percentOfTotal: totalCurrent > 0
                        ? parseFloat(((row.currentAmount / totalCurrent) * 100).toFixed(1))
                        : 0,
                    vsPrevious: {
                        amount: row.previousAmount || 0,
                        change: calcChange(row.currentAmount, row.previousAmount)
                    },
                    vsLastYear: {
                        amount: row.lastYearAmount || 0,
                        change: calcChange(row.currentAmount, row.lastYearAmount)
                    }
                });
            }
        });

        // معالجة التريند اليومي
        const dailyTrend = {
            current: dailyResult.recordset
                .filter(r => r.period === 'current')
                .map(r => ({ day: r.day, amount: r.amount })),
            previous: dailyResult.recordset
                .filter(r => r.period === 'previous')
                .map(r => ({ day: r.day, amount: r.amount }))
        };

        // المؤشرات المتقدمة
        const advancedData = advancedResult.recordset[0] || {};
        const advanced = {
            avgPerTransaction: parseFloat((advancedData.avgPerTransaction || 0).toFixed(2)),
            maxSingleExpense: advancedData.maxSingleExpense || 0,
            minSingleExpense: advancedData.minSingleExpense || 0,
            totalTransactions: advancedData.totalTransactions || 0,
            activeDays: advancedData.activeDays || 0,
            stdDeviation: parseFloat((advancedData.stdDeviation || 0).toFixed(2)),
            mostFrequentKind: mostFrequentResult.recordset[0]
                ? {
                    name: mostFrequentResult.recordset[0].kindName,
                    count: mostFrequentResult.recordset[0].transactionCount,
                    total: mostFrequentResult.recordset[0].totalAmount
                }
                : null
        };

        // التوقعات
        const daysInMonth = new Date(
            dates.current.start.getFullYear(),
            dates.current.start.getMonth() + 1,
            0
        ).getDate();

        const forecast = {
            totalSoFar: totalCurrent,
            dailyAverage: advanced.activeDays > 0
                ? parseFloat((totalCurrent / advanced.activeDays).toFixed(2))
                : 0,
            projectedTotal: advanced.activeDays > 0
                ? parseFloat(((totalCurrent / advanced.activeDays) * daysInMonth).toFixed(2))
                : 0,
            daysElapsed: advanced.activeDays,
            daysRemaining: daysInMonth - advanced.activeDays,
            daysInMonth
        };

        // توزيع المجموعات (للـ Pie Chart)
        const groupDistribution = groupsData.map(g => ({
            group: g.group,
            amount: g.current,
            percent: totalCurrent > 0
                ? parseFloat(((g.current / totalCurrent) * 100).toFixed(1))
                : 0
        }));

        // ──────────────────────────────────────
        // 7. التنبيهات الذكية
        // ──────────────────────────────────────
        const insights = generateSmartInsights({
            totalCurrent, totalPrevious, totalLastYear,
            groupsData, branchesData, advanced, forecast
        });

        // ──────────────────────────────────────
        // 8. التحليل المالي الاحترافي
        // ──────────────────────────────────────
        const financialAnalysis = generateFinancialAnalysis({
            totalCurrent, totalPrevious, totalLastYear,
            groupsData, branchesData, advanced, forecast, dates
        });

        // ──────────────────────────────────────
        // 9. إرسال الرد النهائي
        // ──────────────────────────────────────
        res.status(200).json({
            // الفترات
            dates: {
                current: dates.current,
                previous: dates.previous,
                lastYear: dates.lastYear,
                meta: dates.meta
            },

            // الملخص العام
            summary: {
                totalCurrent,
                vsPrevious: {
                    total: totalPrevious,
                    diff: totalCurrent - totalPrevious,
                    percent: calcChange(totalCurrent, totalPrevious),
                    trend: totalCurrent >= totalPrevious ? 'up' : 'down'
                },
                vsLastYear: {
                    total: totalLastYear,
                    diff: totalCurrent - totalLastYear,
                    percent: calcChange(totalCurrent, totalLastYear),
                    trend: totalCurrent >= totalLastYear ? 'up' : 'down'
                }
            },

            // التوقعات
            forecast,

            // المؤشرات المتقدمة
            advanced,

            // تحليل المجموعات
            groupsData,

            // توزيع المجموعات (Pie Chart)
            groupDistribution,

            // تحليل الفروع
            branchesData,

            // أعلى 5 بنود
            top5Expenses: top5Result.recordset.map(r => ({
                name: r.kindName,
                group: r.kindGroup,
                amount: r.totalAmount,
                transactions: r.transactionCount,
                percent: r.percentOfTotal
            })),

            // أعلى 5 ارتفاعاً
            topIncreases: topIncreaseResult.recordset.map(r => ({
                name: r.kindName,
                current: r.currentAmount,
                previous: r.previousAmount,
                change: r.changePercent
            })),

            // أعلى 5 توفيراً
            topSavings: topSavingsResult.recordset.map(r => ({
                name: r.kindName,
                current: r.currentAmount,
                previous: r.previousAmount,
                saved: r.savedAmount,
                savingPercent: r.savingPercent
            })),

            // الرسوم البيانية
            charts: {
                dailyTrend,
                weekdayAnalysis: weekdayResult.recordset.map(r => ({
                    dayNumber: r.dayNumber,
                    dayName: r.dayName,
                    total: r.totalAmount,
                    average: parseFloat((r.avgAmount || 0).toFixed(2)),
                    transactions: r.transactionCount
                })),
                seasonalTrend: seasonalResult.recordset.map(r => ({
                    month: r.month,
                    monthName: r.monthName,
                    year: r.year,
                    total: r.totalAmount,
                    transactions: r.transactionCount
                }))
            },

            // التنبيهات الذكية
            insights,

            // التحليل المالي الاحترافي
            financialAnalysis
        });

    } catch (err) {
        console.error('ExpensesKPI Error:', err);
        res.status(500).json({
            error: 'حدث خطأ في جلب مؤشرات الأداء',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// ════════════════════════════════════════════════════════════
// 📋 دالة جلب الفلاتر المتاحة (للـ Dropdowns في Flutter)
// ════════════════════════════════════════════════════════════
const getExpenseFilters = async (req, res) => {
    try {
        const request = new sql.Request();

        const [branchesResult, groupsResult, kindsResult] = await Promise.all([
            request.query(`
                SELECT DISTINCT b.IDbranch as id, b.branchName as name
                FROM tbl_Branch b
                ORDER BY b.branchName
            `),
            new sql.Request().query(`
                SELECT DISTINCT k.KindGroup as name
                FROM tbl_expenseKind k
                WHERE k.KindGroup IS NOT NULL AND k.KindGroup <> ''
                ORDER BY k.KindGroup
            `),
            new sql.Request().query(`
                SELECT k.ID as id, k.KindName as name, k.KindGroup as groupName
                FROM tbl_expenseKind k
                WHERE k.ID <> 8
                ORDER BY k.KindGroup, k.KindName
            `)
        ]);

        res.status(200).json({
            branches: branchesResult.recordset,
            groups: groupsResult.recordset,
            kinds: kindsResult.recordset
        });

    } catch (err) {
        console.error('ExpenseFilters Error:', err);
        res.status(500).json({
            error: 'حدث خطأ في جلب الفلاتر',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

module.exports = { getExpensesKPI, getExpenseFilters };