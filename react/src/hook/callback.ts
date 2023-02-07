import { useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useLatestCallback<T extends Function>(callback: T): T {
    let sharedVersion = useRef<string>(undefined);
    let myVersion = uuidv4();
    sharedVersion.current = myVersion;
    
    return ((...args: any) => {
        if(myVersion === sharedVersion.current) {
            callback(...args);
        }
    }) as Function as T;
}
