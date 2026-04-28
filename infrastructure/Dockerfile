FROM alpine/terragrunt:1.5.5

RUN apk update && \
    apk upgrade && \
    apk -v --update add \
        bash \
        curl \
        git \
        groff \
        jq \
        less \
        make \
        openssh \
        py3-pip \
        python3 \
        unzip \
        vim \
        && \
    pip3 install --upgrade \
        awscli \
        && \
    apk -v --purge del && \
    rm /var/cache/apk/*

RUN mkdir -p /infra
ENV PS1 '\[\033[1;37m\]($(echo `terraform workspace show`)) \[\033[1;33m\]\u \[\033[1;36m\]\h \[\033[1;34m\]\w\[\033[0;35m\] \[\033[1;36m\]# \[\033[0m\]'
WORKDIR /infra

RUN echo "alias t=terragrunt" > ~/.bashrc && \
    echo "alias 'ti=t init'" >> ~/.bashrc && \
    echo "alias 'tp=t plan'" >> ~/.bashrc && \
    echo "alias 'ta=t apply'" >> ~/.bashrc && \
    echo "alias 'tw=t workspace'" >> ~/.bashrc && \
    echo "alias 'twn=tw new'" >> ~/.bashrc && \
    echo "alias 'twl=tw list'" >> ~/.bashrc && \
    echo "alias 'tws=tw select'" >> ~/.bashrc && \
    terraform -install-autocomplete

ENTRYPOINT "bash"
