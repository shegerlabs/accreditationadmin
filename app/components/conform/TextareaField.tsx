import { FieldMetadata, getTextareaProps } from '@conform-to/react'
import { ComponentProps } from 'react'
import { Textarea } from '~/components/ui/textarea'

export const TextareaField = ({
	meta,
	...props
}: {
	meta: FieldMetadata<string | null | undefined>
} & ComponentProps<typeof Textarea>) => {
	return <Textarea {...getTextareaProps(meta)} {...props} />
}
