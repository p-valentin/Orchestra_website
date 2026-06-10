import Image from 'next/image'

export default function Shot({
  src,
  alt,
  width,
  height,
  title,
  caption,
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 560px',
  frameClassName = '',
  imgClassName = 'h-auto w-full',
}: {
  src: string
  alt: string
  width: number
  height: number
  title?: string
  caption?: string
  priority?: boolean
  sizes?: string
  frameClassName?: string
  imgClassName?: string
}) {
  return (
    <figure>
      <div
        className={`overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60 ${frameClassName}`}
      >
        {title && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a352b]" />
            <span className="ml-3 font-mono text-[11px] text-muted">{title}</span>
          </div>
        )}
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={sizes}
          className={imgClassName}
        />
      </div>
      {caption && (
        <figcaption className="mt-3.5 text-center font-mono text-xs leading-relaxed text-faint">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
