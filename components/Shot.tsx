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
