// Stub file for @repo/ui package in tests
// This file provides the exports that the real package has, but as simple stubs

// Mock function factory
const mockFn = () => (() => {}) as any;

// Mock component factory
const mockComponent = (name: string) => ({
	name,
	template: `<div><slot /></div>`,
	props: [] as any,
});

export const Button = {
	name: 'Button',
	template: '<button><slot /></button>',
	props: ['variant', 'size', 'disabled', 'onClick'],
};

export const Input = {
	name: 'Input',
	template: '<input><slot /></input>',
	props: ['modelValue', 'placeholder', 'type', 'disabled'],
};

export const Dialog = {
	name: 'Dialog',
	template: '<div><slot /></div>',
	props: ['open'],
};

export const DialogContent = {
	name: 'DialogContent',
	template: '<div><slot /></div>',
};

export const DialogTitle = {
	name: 'DialogTitle',
	template: '<h2><slot /></h2>',
};

export const DialogDescription = {
	name: 'DialogDescription',
	template: '<p><slot /></p>',
};

export const DialogFooter = {
	name: 'DialogFooter',
	template: '<div><slot /></div>',
};

export const DialogHeader = {
	name: 'DialogHeader',
	template: '<div><slot /></div>',
};

export const Table = {
	name: 'Table',
	template: '<table><slot /></table>',
};

export const TableHeader = {
	name: 'TableHeader',
	template: '<thead><slot /></thead>',
};

export const TableBody = {
	name: 'TableBody',
	template: '<tbody><slot /></tbody>',
};

export const TableRow = {
	name: 'TableRow',
	template: '<tr><slot /></tr>',
};

export const TableHead = {
	name: 'TableHead',
	template: '<th><slot /></th>',
};

export const TableCell = {
	name: 'TableCell',
	template: '<td><slot /></td>',
};

export const Tooltip = {
	name: 'Tooltip',
	template: '<div><slot /></div>',
};

export const TooltipContent = {
	name: 'TooltipContent',
	template: '<div><slot /></div>',
};

export const TooltipProvider = {
	name: 'TooltipProvider',
	template: '<div><slot /></div>',
};

export const TooltipTrigger = {
	name: 'TooltipTrigger',
	template: '<div><slot /></div>',
};

export const Toast = {
	name: 'Toast',
	template: '<div><slot /></div>',
};

export const useToast = mockFn();

export const Card = {
	name: 'Card',
	template: '<div><slot /></div>',
};

export const CardHeader = {
	name: 'CardHeader',
	template: '<div><slot /></div>',
};

export const CardTitle = {
	name: 'CardTitle',
	template: '<h3><slot /></h3>',
};

export const CardDescription = {
	name: 'CardDescription',
	template: '<p><slot /></p>',
};

export const CardContent = {
	name: 'CardContent',
	template: '<div><slot /></div>',
};

export const CardFooter = {
	name: 'CardFooter',
	template: '<div><slot /></div>',
};

export const Select = {
	name: 'Select',
	template: '<select><slot /></select>',
};

export const SelectContent = {
	name: 'SelectContent',
	template: '<div><slot /></div>',
};

export const SelectItem = {
	name: 'SelectItem',
	template: '<option><slot /></option>',
};

export const SelectTrigger = {
	name: 'SelectTrigger',
	template: '<button><slot /></button>',
};

export const SelectValue = {
	name: 'SelectValue',
	template: '<span><slot /></span>',
};

export const Label = {
	name: 'Label',
	template: '<label><slot /></label>',
};

export const Badge = {
	name: 'Badge',
	template: '<span><slot /></span>',
};

export const Tabs = {
	name: 'Tabs',
	template: '<div><slot /></div>',
};

export const TabsList = {
	name: 'TabsList',
	template: '<div><slot /></div>',
};

export const TabsTrigger = {
	name: 'TabsTrigger',
	template: '<button><slot /></button>',
};

export const TabsContent = {
	name: 'TabsContent',
	template: '<div><slot /></div>',
};
