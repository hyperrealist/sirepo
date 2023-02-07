import { useRef } from "react";
import { v4 as uuidv4 } from 'uuid';

export function useUniqueKey() {
    let k = useRef<string>(uuidv4());
    return k.current;
}
