export function mergeWith(destination, ...sources) {
    sources.forEach((source) => {
        Object.keys(source).forEach((key) => {
            if (
                source[key] instanceof Object &&
                destination[key] instanceof Object
            ) {
                // If both values are objects, recursively merge them
                destination[key] = mergeWith(destination[key], source[key])
            } else {
                // Otherwise, assign the value directly
                destination[key] = source[key]
            }
        })
    })
    return destination
}
