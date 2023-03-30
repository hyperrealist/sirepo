import { useSelector } from "react-redux";
import { AnyAction, Dispatch } from "redux";
import { ArrayFieldElement, ArrayFieldState } from "../store/common";
import { getModelReadSelector, getModelWriteActionCreator, StoreType } from "./data";

export abstract class DataHandle<V> {
    constructor(protected currentValue: V) {
        this.value = currentValue;
    }

    abstract write(value: V, dispatch: Dispatch<AnyAction>);
    readonly value: V; 
}

export abstract class ArrayDataHandle<V extends ArrayFieldState<V>> extends DataHandle<V> {
    abstract append(element: ArrayFieldElement<V>, dispatch: Dispatch<AnyAction>);
    abstract appendAt(index: number, element: ArrayFieldElement<V>, dispatch: Dispatch<AnyAction>);
    abstract removeAt(index: number, dispatch: Dispatch<AnyAction>);
}

export interface EmptyDataHandle<V, D extends DataHandle<V> = DataHandle<V>> {
    /**
     * use the current state to populate the data in the handle without subscribing to updates
     * @param state current state
     */
    initialize(state: any): D;
    /**
     * create handle using selector hooks, subscribes to data updates where these hooks are called
     */
    hook(): D;
}

export abstract class HandleFactory {
    abstract createHandle<V>(dependency: Dependency, type: StoreType): EmptyDataHandle<V>;
    abstract createArrayHandle<V extends ArrayFieldState<V>>(dependency: Dependency, type: StoreType): EmptyDataHandle<V>;
}

export class BaseHandleFactory extends HandleFactory {
    createHandle<V>(dependency: Dependency, type: StoreType): EmptyDataHandle<V> {
        let ms = getModelReadSelector<V>(type)(dependency.modelName);
        let mac = getModelWriteActionCreator<V>(type);
        let cdh = (value: V): DataHandle<V> => {
            return new (class extends DataHandle<V> {
                write = (value: V, dispatch: Dispatch<AnyAction>) => {
                    dispatch(mac(dependency.modelName, value));
                }
            })(value);
        }
        return {
            initialize: (state: any) => {
                return cdh(ms(state));
            },
            hook: () => {
                return cdh(useSelector(ms));
            }
        }
    }

    createArrayHandle<V extends ArrayFieldState<V>>(dependency: Dependency, type: StoreType): EmptyDataHandle<V, ArrayDataHandle<V>> {
        let ms = getModelReadSelector<V>(type)(dependency.modelName);
        let mac = getModelWriteActionCreator<V>(type);
        let cdh = (value: V): ArrayDataHandle<V> => {
            return new (class extends ArrayDataHandle<V> {
                write = (value: V, dispatch: Dispatch<AnyAction>) => {
                    dispatch(mac(dependency.modelName, value));
                }
                appendAt = (index: number, element: ArrayFieldElement<V>, dispatch: Dispatch<AnyAction>) => {
                    this.currentValue.splice(index, 0, element);
                    this.write(this.currentValue, dispatch);
                }
                append = (element: ArrayFieldElement<V>, dispatch: Dispatch<AnyAction>) => {
                    this.currentValue.push(element);
                    this.write(this.currentValue, dispatch);
                }
                removeAt = (index: number, dispatch: Dispatch<AnyAction>) => {
                    this.currentValue.splice(index, 1);
                    this.write(this.currentValue, dispatch);
                }
            })(value);
        }
        return {
            initialize: (state: any) => {
                return cdh(ms(state));
            },
            hook: () => {
                return cdh(useSelector(ms));
            }
        }
    }
}
