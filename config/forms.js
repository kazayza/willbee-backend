// ═══════════════════════════════════════════════════════════════════════════
// 📋 قائمة الشاشات (النماذج) المستخدمة في نظام الصلاحيات
// ───────────────────────────────────────────────────────────────────────────
// هذه القائمة هي المرجع الوحيد لمصفوفة الصلاحيات، وتُطابق أسماء الشاشات
// (formName) الموجودة في تطبيق Flutter (ملف app_sections.dart).
// ═══════════════════════════════════════════════════════════════════════════

const FORMS = [
    // ─────────────── شئون الأطفال ───────────────
    { fname: 'frm_ChildNew',          title: 'تسجيل طفل جديد',            category: 'شئون الأطفال' },
    { fname: 'frm_Child',             title: 'قائمة الأطفال',              category: 'شئون الأطفال' },
    { fname: 'frm_ChildrenReview',    title: 'أطفال محتاجين مراجعة',       category: 'شئون الأطفال' },
    { fname: 'frm_ClassArchive',      title: 'أرشيف الفصول',               category: 'شئون الأطفال' },
    { fname: 'frmClassesDashboard',   title: 'إدارة الفصول',               category: 'شئون الأطفال' },
    { fname: 'frm_absenseChild',      title: 'غياب الأطفال',               category: 'شئون الأطفال' },
    { fname: 'frm_ChildIncome',       title: 'اشتراكات الأطفال',           category: 'شئون الأطفال' },

    // ─────────────── الموارد البشرية ───────────────
    { fname: 'Employee List',         title: 'قائمة الموظفين',             category: 'الموارد البشرية' },
    { fname: 'frm_EmployeesSalarySummary', title: 'ملخص الموظفين النشطين', category: 'الموارد البشرية' },
    { fname: 'frm_absenseEmp',        title: 'الحضور والانصراف',           category: 'الموارد البشرية' },
    { fname: 'frm_eshraf',            title: 'الجزاءات والمكافآت',         category: 'الموارد البشرية' },
    { fname: 'frm_eshrafOnly',        title: 'الإشراف',                    category: 'الموارد البشرية' },
    { fname: 'frm_AllEshraf',         title: 'إشراف الموارد البشرية',      category: 'الموارد البشرية' },

    // ─────────────── إدارة العملاء (CRM) ───────────────
    { fname: 'frmCRMDashboard',       title: 'لوحة تحكم العملاء',          category: 'إدارة العملاء' },
    { fname: 'CRM KPI',               title: 'مؤشرات أداء العملاء',        category: 'إدارة العملاء' },
    { fname: 'frmLeads',              title: 'العملاء المحتملين',          category: 'إدارة العملاء' },
    { fname: 'frmCustomer',           title: 'العملاء الفعليين',           category: 'إدارة العملاء' },
    { fname: 'frmTasksList',          title: 'قائمة المهام',               category: 'إدارة العملاء' },
    { fname: 'frmAddTask',            title: 'إضافة مهمة جديدة',           category: 'إدارة العملاء' },
    { fname: 'frmInteractions',       title: 'سجل التواصلات',              category: 'إدارة العملاء' },

    // ─────────────── الإيرادات ───────────────
    { fname: 'IncomeKPI',             title: 'مؤشرات أداء الإيرادات',      category: 'الإيرادات' },
    { fname: 'DebetsKPI',             title: 'مؤشرات أداء المديونيات',     category: 'الإيرادات' },
    { fname: 'frmListIncome',         title: 'كافة الإيرادات',             category: 'الإيرادات' },
    { fname: 'frm_income',            title: 'إضافة إيراد',                category: 'الإيرادات' },
    { fname: 'frm_MonthlySubscrip',   title: 'اشتراك العام الدراسي',       category: 'الإيرادات' },
    { fname: 'frm_IncomBus',          title: 'اشتراك الباص',               category: 'الإيرادات' },
    { fname: 'frm_incomMoragaa',      title: 'مراجعة الإيرادات',           category: 'الإيرادات' },
    { fname: 'frm_incomeKindEdite',   title: 'بنود الإيرادات',             category: 'الإيرادات' },
    { fname: 'frm_payment',           title: 'الأقساط الشهرية',            category: 'الإيرادات' },
    { fname: 'frm_PaymentCHildAll',   title: 'المديونيات والأقساط',        category: 'الإيرادات' },

    // ─────────────── المصروفات ───────────────
    { fname: 'ExpensesKPI',           title: 'مؤشر أداء المصروفات',        category: 'المصروفات' },
    { fname: 'frm_expenses',          title: 'المصروفات',                  category: 'المصروفات' },
    { fname: 'frm_expSingle',         title: 'إضافة مصروف فردي',           category: 'المصروفات' },
    { fname: 'frm_salary',            title: 'المرتبات',                   category: 'المصروفات' },
    { fname: 'frm_expenseKindEdite',  title: 'بنود المصروفات',             category: 'المصروفات' },

    // ─────────────── التقارير ───────────────
    { fname: 'frm_QaemaMarkazMaly',   title: 'المركز المالي',              category: 'التقارير' },
    { fname: 'frm_QryArsedaChild',    title: 'متابعة الأرصدة',             category: 'التقارير' },
    { fname: 'rpt_absenseChild',      title: 'تقرير غياب الأطفال',         category: 'التقارير' },
    { fname: 'frm_reportincomeDetalis',title: 'استعلام الإيرادات',         category: 'التقارير' },
    { fname: 'frm_KindIncomeChild',   title: 'اشتراك معين لطفل',           category: 'التقارير' },
    { fname: 'frm_qrysalary',         title: 'استعلام المرتبات',           category: 'التقارير' },

    // ─────────────── الباص ───────────────
    { fname: 'frm_Qbuslines',         title: 'خطوط سير الباص',             category: 'الباص' },
    { fname: 'frm_BusLines',          title: 'أسماء خطوط السير',           category: 'الباص' },

    // ─────────────── الإعدادات ───────────────
    { fname: 'frm_users',             title: 'المستخدمين',                 category: 'الإعدادات' },
    { fname: 'frm_Managment',         title: 'الإدارات',                   category: 'الإعدادات' },
    { fname: 'frm_company',           title: 'بيانات الحضانة',             category: 'الإعدادات' },
    { fname: 'frm_AdminNotifications', title: 'إشعارات النظام (أدمن)',     category: 'الإعدادات' },
    { fname: 'frm_salesPolo',         title: 'مبيعات التيشيرتات',          category: 'الإعدادات' },
];

// الأدوار المتاحة في النظام
const ROLES = ['Admin', 'AccountantUser', 'PRUser', 'HRUser', 'AppUser'];

module.exports = { FORMS, ROLES };
