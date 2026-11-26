export default function ProjectLogo({ alt = '', className }) {
  return <img src="/project-logo-192.png" alt={alt} width={192} height={192}
    className={'shrink-0 rounded-xl object-contain ' + className} />;
}
