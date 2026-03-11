export interface TransactionFilterValues {
	accountId: string;
	category: string;
	payee: string;
	reconciled: string;
	fromDate: string;
	toDate: string;
	minAmount: string;
	maxAmount: string;
}

export const emptyFilters: TransactionFilterValues = {
	accountId: '',
	category: '',
	payee: '',
	reconciled: '',
	fromDate: '',
	toDate: '',
	minAmount: '',
	maxAmount: '',
};
