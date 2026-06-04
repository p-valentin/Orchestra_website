import Image from 'next/image'

export default function ProductShot({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 1120px',
  frameClassName = '',
  imgClassName = 'h-auto w-full',
}: {
  src: string
  alt: string
  width: number
  height: number
  caption?: string
  priority?: boolean
  sizes?: string
  frameClassName?: string
  imgClassName?: string
}) {
  return (
    <figure className="relative">
      {/* teal bloom behind the frame */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -top-10 bottom-4 -z-10 rounded-[2.5rem] bg-teal/10 blur-3xl"
      />
      <div
        className={`overflow-hidden rounded-xl border border-subtle bg-surface shadow-2xl shadow-black/50 ring-1 ring-white/5 ${frameClassName}`}
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
        <figcaption className="mt-4 text-center font-mono text-xs text-text-secondary">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
