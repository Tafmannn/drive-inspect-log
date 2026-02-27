interface UKPlateProps {
  reg: string;
  variant?: 'front' | 'rear';
}

export const UKPlate = ({ reg, variant = 'front' }: UKPlateProps) => {
  const bg = variant === 'rear' ? '#FCD116' : '#FFFFFF';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        backgroundColor: bg,
        border: '1px solid #999',
        borderRadius: 3,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        height: 24,
      }}
    >
      {/* Blue UK bar */}
      <div
        style={{
          width: 18,
          backgroundColor: '#003399',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1px 0',
        }}
      >
        <span style={{ color: '#FFFFFF', fontSize: 7, fontWeight: 700, lineHeight: 1, letterSpacing: 0.5 }}>
          UK
        </span>
      </div>
      {/* Reg text */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#000000',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            lineHeight: 1,
          }}
        >
          {reg}
        </span>
      </div>
    </div>
  );
};
