import { Modules } from '../../lib'
import { timer } from 'rxjs'
import { map } from 'rxjs/operators'

export const configuration = {
    schema: {
        dueTime: Modules.floatAttribute(
            {
                value: 0,
            },
            { override: 'final' },
        ),
        interval: Modules.floatAttribute(
            {
                value: 1000,
            },
            { override: 'final' },
        ),
    },
}

export const outputs = (
    arg: Modules.OutputMapperArg<typeof configuration.schema, never>,
) => ({
    output$: timer(arg.configuration.dueTime, arg.configuration.interval).pipe(
        map((c) => {
            return {
                data: c,
                context: {},
            }
        }),
    ),
})

export function module(fwdParams) {
    return new Modules.Implementation(
        {
            configuration,
            outputs,
        },
        fwdParams,
    )
}
