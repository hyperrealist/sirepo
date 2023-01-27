import { Dependency } from "../../data/dependency";
import { Layout } from "../layout"

export type InputComponentProps<V> = {
    valid: boolean,
    value: V,
    touched: boolean,
    dependency: Dependency,
    onChange: (newValue: V) => void
}

export type AlignmentClass = 'text-end' | 'text-start';

export type InputConfigBase = {
    isRequired: boolean
}

export type InputLayoutType<C extends InputConfigBase = any, V = unknown, M = unknown, L extends InputLayout<C, V, M> = any> = new(config: C) => L

export abstract class InputLayout<C extends InputConfigBase = any, V = unknown, M=V> extends Layout<C, InputComponentProps<V>> {
    constructor(config: C) {
        super(config);
    }

    getFormDependencies(): Dependency[] {
        return [];
    }

    abstract toModelValue: (value: V) => M;
    abstract fromModelValue: (value: M) => V;

    abstract validate: (value: V) => boolean;

    hasValue: (value: any) => boolean = (value: any) => {
        return value !== undefined && value != null;
    }
}
