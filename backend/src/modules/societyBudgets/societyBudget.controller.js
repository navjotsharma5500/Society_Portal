const service = require("./societyBudget.service");

const create = async (req, res) => { const budget = await service.createAnnualBudget(req.body); res.status(201).json({ success: true, message: "Society annual budget created successfully", data: { budget } }); };
const list = async (req, res) => res.status(200).json({ success: true, data: await service.listBudgets(req.budgetFilters) });
const getOne = async (req, res) => res.status(200).json({ success: true, data: { budget: await service.getBudget(req.params.budgetId) } });
const current = async (req, res) => res.status(200).json({ success: true, data: { budget: await service.getCurrentBudget(req.params.societyId, req.academicSession) } });
const adjust = async (req, res) => res.status(200).json({ success: true, message: "Budget allocation adjusted successfully", data: { budget: await service.adjustBudget(req.params.budgetId, req.body) } });
const manualAdjustment = async (req, res) => res.status(200).json({ success: true, message: "Budget manually adjusted successfully", data: { budget: await service.manualAdjustment(req.params.budgetId, req.body) } });
const close = async (req, res) => res.status(200).json({ success: true, message: "Budget closed successfully", data: { budget: await service.closeBudget(req.params.budgetId, req.body) } });
const transactions = async (req, res) => res.status(200).json({ success: true, data: await service.listTransactions(req.params.budgetId, req.transactionFilters) });
const summary = async (req, res) => res.status(200).json({ success: true, data: await service.getSummary(req.academicSession) });

module.exports = { create, list, getOne, current, adjust, manualAdjustment, close, transactions, summary };
